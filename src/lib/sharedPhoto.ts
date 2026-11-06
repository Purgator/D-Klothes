/**
 * Hand-off of a photo shared into the app by another app (see public/share-target-sw.js).
 * The service worker parks the file in a dedicated cache; the app collects it here, deleting
 * the entry at once, and keeps it in memory only until the upload screen takes it.
 */
const SHARE_CACHE = 'dklothes-share-target'
const SHARE_ENTRY = '/shared-photo'

let pending: File | null = null

/** Collect the photo the service worker received, if any, and clear it from the cache. */
export async function collectSharedPhoto(): Promise<File | null> {
  if (typeof caches === 'undefined') return pending
  try {
    const cache = await caches.open(SHARE_CACHE)
    const response = await cache.match(SHARE_ENTRY)
    if (response) {
      const blob = await response.blob()
      const name = decodeURIComponent(response.headers.get('x-file-name') || 'photo')
      pending = new File([blob], name, { type: blob.type })
    }
    await caches.delete(SHARE_CACHE)
  } catch {
    // Cache unavailable (private window): only an in-memory hand-off can exist.
  }
  return pending
}

/** Keep a file for the upload screen to take (also used after choosing a group). */
export function holdSharedPhoto(file: File | null) {
  pending = file
}

/** Take the held file; it is handed over once only. */
export function takeSharedPhoto(): File | null {
  const file = pending
  pending = null
  return file
}
