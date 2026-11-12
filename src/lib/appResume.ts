/**
 * An installed app is never reloaded by hand: it is left in the background and brought back
 * hours later. Data that is loaded once (profile, overview, feeds whose Realtime channel slept)
 * is refetched when the app returns to the foreground after a real absence.
 */
export const RESUME_AFTER_HIDDEN_MS = 60 * 1000

const listeners = new Set<() => void>()
let installed = false
let hiddenAt: number | null = null

/** Whether coming back at `now` after being hidden at `hiddenSince` counts as a resume. */
export function isResume(hiddenSince: number | null, now: number): boolean {
  return hiddenSince !== null && now - hiddenSince >= RESUME_AFTER_HIDDEN_MS
}

function install() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    const resumed = isResume(hiddenAt, Date.now())
    hiddenAt = null
    if (!resumed) return
    for (const listener of [...listeners]) {
      try {
        listener()
      } catch {
        // One failing listener must not keep the others from refreshing.
      }
    }
  })
}

/** Run `listener` each time the app comes back after a while in the background. Returns the unsubscribe. */
export function onAppResume(listener: () => void): () => void {
  install()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
