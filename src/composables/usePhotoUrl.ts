import { onUnmounted, ref, watch, type Ref } from 'vue'
import { PHOTOS_BUCKET, supabase } from '@/lib/supabase'

/**
 * Photos are read from the private bucket's authenticated endpoint: the address of a photo
 * never changes and the session token travels in a header, so the browser's own HTTP cache
 * keeps the bytes (photos are uploaded with a long max-age and never modified). A photo is
 * downloaded from Supabase once per device, not once per visit, and no signed URL is needed.
 *
 * An <img> cannot send the session header, so the bytes are handed over as an object URL.
 * Object URLs are shared between components, counted, and revoked once enough unused ones pile up.
 */
interface Entry {
  url: string
  refs: number
}

const IDLE_LIMIT = 40
const entries = new Map<string, Entry>()
const pending = new Map<string, Promise<Entry | null>>()
let generation = 0

/** The photo's bytes, from the browser cache when it has them. Authorization is the caller's session. */
export async function getPhotoBlob(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(path)
  if (error || !data) throw error ?? new Error('photo_download_failed')
  return data
}

function trimIdle() {
  let idle = 0
  for (const entry of entries.values()) if (entry.refs === 0) idle++
  // Map order is least recently released first.
  for (const [path, entry] of entries) {
    if (idle <= IDLE_LIMIT) break
    if (entry.refs > 0) continue
    URL.revokeObjectURL(entry.url)
    entries.delete(path)
    idle--
  }
}

async function acquire(path: string): Promise<string | null> {
  let entry: Entry | null | undefined = entries.get(path)
  if (!entry) {
    let loading = pending.get(path)
    if (!loading) {
      const startedIn = generation
      loading = getPhotoBlob(path)
        .then((blob) => {
          // Signed out while downloading: nothing may outlive the session.
          if (startedIn !== generation) return null
          const created: Entry = { url: URL.createObjectURL(blob), refs: 0 }
          entries.set(path, created)
          return created
        })
        .finally(() => pending.delete(path))
      pending.set(path, loading)
    }
    entry = await loading
  }
  if (!entry) return null
  entry.refs++
  return entry.url
}

function release(path: string, url: string) {
  const entry = entries.get(path)
  if (!entry || entry.url !== url) return
  entry.refs = Math.max(0, entry.refs - 1)
  if (entry.refs === 0) {
    entries.delete(path)
    entries.set(path, entry)
    trimIdle()
  }
}

/** Drop every photo held in memory (sign-out). */
export function clearPhotoCache(): void {
  generation++
  for (const entry of entries.values()) URL.revokeObjectURL(entry.url)
  entries.clear()
}

/** Object URL of a photo, loaded once `enabled` is true (lets a tile wait until it is near the screen). */
export function usePhotoUrl(path: Ref<string | null | undefined>, enabled: Ref<boolean> = ref(true)) {
  const url = ref<string | null>(null)
  const failed = ref(false)
  let held: { path: string; url: string } | null = null
  let run = 0

  function drop() {
    if (held) release(held.path, held.url)
    held = null
    url.value = null
  }

  async function load() {
    const mine = ++run
    drop()
    failed.value = false
    const wanted = path.value
    if (!wanted || !enabled.value) return
    try {
      const acquired = await acquire(wanted)
      if (mine !== run) {
        // The tile moved on (or went away) while the photo was loading.
        if (acquired) release(wanted, acquired)
        return
      }
      if (!acquired) return
      held = { path: wanted, url: acquired }
      url.value = acquired
    } catch {
      if (mine === run) failed.value = true
    }
  }

  watch([path, enabled], load, { immediate: true })
  onUnmounted(() => {
    run++
    drop()
  })
  return { url, failed, reload: load }
}
