import type { RouteLocationNormalized, Router } from 'vue-router'

/**
 * Make the browser's back button behave like an app's:
 * - a detail screen pops back to the screen it was opened from;
 * - any other tab goes back to the first tab (the review deck);
 * - on the first tab, back warns once and the next press leaves the app.
 *
 * It works by keeping one extra history entry ("guard") under the first app screen. Landing on
 * it by a pop means the user pressed back at the root; the guard then decides where to go. When
 * the warning is showing the app sits on the guard entry itself, so the following back press has
 * nothing left to pop and the platform closes the installed app (or leaves the site in a browser).
 */
const EXIT_WINDOW_MS = 2500
const GUARD_POSITION_KEY = 'dklothes.guard'

// Position of the entry the router last settled on. On a pop, the browser has already moved to
// another entry when the guards run, so a different position means "back" (or "forward").
let settledPosition: number | null = null
let rearmTimer: ReturnType<typeof setTimeout> | undefined

function currentPosition(): number | null {
  const position = window.history.state?.position
  return typeof position === 'number' ? position : null
}

function isAppRoute(route: RouteLocationNormalized): boolean {
  return route.meta.layout === 'tabs' || route.meta.layout === 'stack'
}

/** True while the app sits on the guard entry (the exit warning is showing). */
export function atAppRoot(): boolean {
  return typeof window !== 'undefined' && window.history.state?.guard === true
}

function readGuardPosition(): number | null {
  try {
    const raw = sessionStorage.getItem(GUARD_POSITION_KEY)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}
function writeGuardPosition(position: number) {
  try {
    sessionStorage.setItem(GUARD_POSITION_KEY, String(position))
  } catch {
    // Without storage the guard is simply recreated after a reload.
  }
}

export function installAppNavigation(router: Router, { onExitWarning }: { onExitWarning: () => void }) {
  if (typeof window === 'undefined') return

  // The navigation a redirect below starts still sees the popped position: let it through.
  let redirecting = false
  router.beforeEach((_to, from) => {
    if (redirecting) return true
    const isPop = settledPosition !== null && currentPosition() !== settledPosition
    if (!isPop || !atAppRoot() || !isAppRoute(from)) return true

    // Back pressed at the root of the app.
    redirecting = true
    if (from.name !== 'home') {
      // Pushing keeps the guard underneath the first tab.
      return { name: 'home', force: true }
    }
    onExitWarning()
    clearTimeout(rearmTimer)
    rearmTimer = setTimeout(() => {
      // The user stayed: lift the first tab back above the guard so the next press warns again.
      if (atAppRoot() && router.currentRoute.value.name === 'home') void router.push({ name: 'home', force: true })
    }, EXIT_WINDOW_MS)
    return { name: 'home', replace: true, force: true, state: { guard: true } }
  })

  let establishing = false
  router.afterEach((to, _from, failure) => {
    redirecting = false
    settledPosition = currentPosition()
    if (failure || establishing || !isAppRoute(to)) return
    const state = window.history.state
    if (state?.guard) {
      writeGuardPosition(state.position)
      return
    }
    const guardPosition = readGuardPosition()
    if (guardPosition !== null && typeof state?.position === 'number' && state.position > guardPosition) return
    // First app screen of this session: slip the guard entry underneath it.
    establishing = true
    const here = { name: to.name ?? undefined, params: to.params, query: to.query, hash: to.hash }
    void router
      .replace({ ...here, force: true, state: { guard: true } })
      .then(() => router.push({ ...here, force: true }))
      .finally(() => {
        establishing = false
        const current = window.history.state
        if (typeof current?.position === 'number') writeGuardPosition(current.position - 1)
      })
  })
}
