import { onUnmounted, ref, watch, type Ref } from 'vue'
import { PHOTOS_BUCKET, SIGNED_URL_TTL_SECONDS, supabase } from '@/lib/supabase'

// In-memory cache of signed URLs. They are bearer credentials: never persisted, never logged.
const cache = new Map<string, { url: string; expiresAt: number }>()
const RENEW_MARGIN_MS = 60 * 1000

export async function getSignedPhotoUrl(path: string): Promise<string> {
  const cached = cache.get(path)
  if (cached && cached.expiresAt - RENEW_MARGIN_MS > Date.now()) return cached.url
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw error ?? new Error('signed_url_failed')
  cache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 })
  return data.signedUrl
}

export function clearPhotoUrlCache(): void {
  cache.clear()
}

export function usePhotoUrl(path: Ref<string | null | undefined>) {
  const url = ref<string | null>(null)
  const failed = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function load() {
    clearTimeout(timer)
    failed.value = false
    url.value = null
    if (!path.value) return
    try {
      const signed = await getSignedPhotoUrl(path.value)
      url.value = signed
      // Renew shortly before the URL expires so a long-open feed keeps working.
      timer = setTimeout(load, (SIGNED_URL_TTL_SECONDS - 90) * 1000)
    } catch {
      failed.value = true
    }
  }

  watch(path, load, { immediate: true })
  onUnmounted(() => clearTimeout(timer))
  return { url, failed, reload: load }
}
