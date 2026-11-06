/*
 * Web Share Target handler, imported by the generated service worker.
 *
 * Another app shares a photo: the platform POSTs it to <base>/share-target, which no static
 * host can answer. This handler takes the file, parks it under a dedicated cache name for the
 * app to collect, and redirects to the "add a received photo" screen. The app deletes the
 * entry as soon as it reads it (src/lib/sharedPhoto.ts), so nothing private lingers.
 */
const SHARE_CACHE = 'dklothes-share-target'
const SHARE_ENTRY = '/shared-photo'

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'POST') return
  const url = new URL(event.request.url)
  if (!url.pathname.endsWith('/share-target')) return
  event.respondWith(
    (async () => {
      const destination = new URL(url.pathname.replace(/share-target$/, 'share'), url.origin)
      try {
        const form = await event.request.formData()
        const file = form.get('photo')
        if (file && typeof file === 'object') {
          const cache = await caches.open(SHARE_CACHE)
          await cache.put(
            SHARE_ENTRY,
            new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name || 'photo') } }),
          )
        }
      } catch {
        // Nothing usable was shared: the screen explains that no photo arrived.
      }
      return Response.redirect(destination.href, 303)
    })(),
  )
})
