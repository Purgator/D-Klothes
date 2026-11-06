import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

/**
 * Keeps the installed app current without asking the user to refresh. The service worker is
 * asked for a new version regularly and whenever the app comes back to the foreground; once a
 * new version is installed it is applied at the next quiet moment (a tab change or the next
 * return to the foreground), which reloads the shell.
 */
const CHECK_INTERVAL_MS = 30 * 60 * 1000
const MIN_HIDDEN_MS = 60 * 1000
const UPDATED_FLAG = 'dklothes.updated'

export const updateReady = ref(false)
let apply: ((reload?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined
let hiddenAt = 0

export function installAppUpdates({ onUpdated }: { onUpdated: () => void }) {
  if (typeof window === 'undefined') return
  // Tell the user once after the shell reloaded with a new version.
  try {
    if (sessionStorage.getItem(UPDATED_FLAG)) {
      sessionStorage.removeItem(UPDATED_FLAG)
      onUpdated()
    }
  } catch {
    // Storage unavailable: the reload is simply silent.
  }
  if (!import.meta.env.PROD) return

  apply = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
      setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS)
    },
    onNeedRefresh() {
      updateReady.value = true
    },
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (updateReady.value) {
      void applyUpdate()
      return
    }
    if (Date.now() - hiddenAt > MIN_HIDDEN_MS) void checkForUpdate()
  })
}

/** Ask the service worker to look for a new version now. */
export async function checkForUpdate(): Promise<void> {
  if (!registration || !navigator.onLine) return
  try {
    await registration.update()
  } catch {
    // Offline or the server is unreachable: the next check will try again.
  }
}

/** Switch to the installed new version (reloads the shell). */
export async function applyUpdate(): Promise<void> {
  if (!updateReady.value || !apply) return
  try {
    sessionStorage.setItem(UPDATED_FLAG, '1')
  } catch {
    // Without storage the reload is silent.
  }
  await apply(true)
}
