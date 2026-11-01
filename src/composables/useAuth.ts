import { computed, ref } from 'vue'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

// Module-level singletons: shared auth state without a state-management library.
const session = ref<Session | null>(null)
const profile = ref<Profile | null>(null)
const ready = ref(false)
let initPromise: Promise<void> | null = null

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
  }
}

export function useAuth() {
  if (!initPromise) {
    initPromise = (async () => {
      const { data } = await supabase.auth.getSession()
      await applySession(data.session)
      ready.value = true
      supabase.auth.onAuthStateChange((event, next) => {
        // Supabase warns against awaiting inside the callback; defer the async work.
        void Promise.resolve().then(() => {
          if (event === 'SIGNED_OUT') return applySession(null)
          return applySession(next)
        })
      })
    })()
  }

  const user = computed(() => session.value?.user ?? null)
  const isSignedIn = computed(() => !!session.value)
  const hasProfile = computed(() => !!profile.value)

  async function whenReady(): Promise<void> {
    await initPromise
  }

  async function signInWithEmail(email: string, redirectPath: string): Promise<void> {
    const emailRedirectTo = `${window.location.origin}/auth/callback`
    try {
      sessionStorage.setItem('dklothes.redirect', redirectPath)
    } catch {
      // Falls back to the home page after sign-in.
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
    if (error) throw error
  }

  function consumeRedirect(): string {
    try {
      const path = sessionStorage.getItem('dklothes.redirect')
      sessionStorage.removeItem('dklothes.redirect')
      return path && path.startsWith('/') && !path.startsWith('//') ? path : '/'
    } catch {
      return '/'
    }
  }

  async function saveDisplayName(displayName: string): Promise<void> {
    const uid = user.value?.id
    if (!uid) throw new Error('unauthenticated')
    const { data, error } = await supabase
      .from('profiles')
      .upsert({ id: uid, display_name: displayName.trim() }, { onConflict: 'id' })
      .select()
      .single()
    if (error) throw error
    profile.value = data
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut()
    await applySession(null)
  }

  async function refreshProfile(): Promise<void> {
    if (user.value) await loadProfile(user.value.id)
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
    consumeRedirect,
    saveDisplayName,
    signOut,
    refreshProfile,
  }
}
