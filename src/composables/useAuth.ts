import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { appUrl, supabase } from '@/lib/supabase'
import { onAppResume } from '@/lib/appResume'
import { clearPhotoCache } from '@/composables/usePhotoUrl'
import type { Profile } from '@/types/database'

// Module-level singletons: shared auth state without a state-management library.
const session = ref<Session | null>(null)
const profile = ref<Profile | null>(null)
const ready = ref(false)
let initPromise: Promise<void> | null = null
// Session changes still being applied (session set, profile on its way).
let applying: Promise<void> = Promise.resolve()

// The magic link usually opens in a new tab, so the return path must survive the tab:
// localStorage, not sessionStorage. It is consumed once, after the first successful sign-in.
const REDIRECT_KEY = 'dklothes.redirect'

function isSafePath(path: string | null): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/auth/')
}

export function rememberRedirect(path: string): void {
  if (!isSafePath(path)) return
  try {
    localStorage.setItem(REDIRECT_KEY, path)
  } catch {
    // Storage unavailable: the user lands on the home page instead.
  }
}

export function consumeRedirect(): string {
  try {
    const path = localStorage.getItem(REDIRECT_KEY)
    localStorage.removeItem(REDIRECT_KEY)
    return isSafePath(path) ? path : '/'
  } catch {
    return '/'
  }
}

async function loadProfile(userId: string): Promise<void> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('profile load failed', error.message)
    return
  }
  profile.value = data
}

async function applySession(next: Session | null): Promise<void> {
  session.value = next
  if (next?.user) {
    if (profile.value?.id !== next.user.id) await loadProfile(next.user.id)
  } else {
    profile.value = null
    clearPhotoCache()
  }
}

/** Reread the profile from the server (plan, notification preferences can change elsewhere). */
async function refreshProfile(): Promise<void> {
  const uid = session.value?.user?.id
  if (uid) await loadProfile(uid)
}

export function useAuth() {
  if (!initPromise) {
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      await applySession(data.session)
      ready.value = true
      // The profile is loaded once per sign-in; an app left open for days must not keep it forever.
      onAppResume(() => void refreshProfile())
      supabase.auth.onAuthStateChange((event, next) => {
        // Supabase warns against awaiting inside the callback; defer the async work. The chain
        // keeps changes in order and lets whenReady() wait for the profile of a fresh sign-in.
        applying = applying
          .then(() => applySession(event === 'SIGNED_OUT' ? null : next))
          .catch((err) => console.error('session change failed', err instanceof Error ? err.message : err))
      })
    })()
  }

  const user = computed(() => session.value?.user ?? null)
  const isSignedIn = computed(() => !!session.value)
  const hasProfile = computed(() => !!profile.value)

  /**
   * Resolves once the session and its profile are both known. After a sign-in the session
   * arrives first and the profile a request later: deciding "no profile yet" in between
   * would send a returning user to the name screen.
   */
  async function whenReady(): Promise<void> {
    await initPromise
    await applying
  }

  async function signInWithEmail(email: string, redirectPath: string): Promise<void> {
    rememberRedirect(redirectPath)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: appUrl('/auth/callback') } })
    if (error) throw error
  }

  async function saveDisplayName(displayName: string): Promise<void> {
    const uid = user.value?.id
    if (!uid) throw new Error('unauthenticated')
    // Insert, never upsert: the name screen must not be able to rename an existing account,
    // whatever made the app believe there was no profile (a race, a failed load).
    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: uid, display_name: displayName.trim() })
      .select()
      .single()
    if (error) {
      if (error.code !== '23505') throw error
      await loadProfile(uid)
      if (!profile.value) throw error
      return
    }
    profile.value = data
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
    await applySession(null)
  }

  return {
    session,
    user,
    profile,
    ready,
    isSignedIn,
    hasProfile,
    whenReady,
    signInWithEmail,
    rememberRedirect,
    consumeRedirect,
    saveDisplayName,
    signOut,
    refreshProfile,
  }
}
