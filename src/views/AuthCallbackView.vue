<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { tokenHashFromFragment } from '@/lib/authLink'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const failed = ref(false)
const baseUrl = import.meta.env.BASE_URL

onMounted(async () => {
  // Links from the sign-in email carry a token hash in the fragment. Take it out of the
  // address bar before anything else, then trade it for a session.
  const tokenHash = tokenHashFromFragment(window.location.hash)
  if (tokenHash) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    await auth.whenReady()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    // Opening the same link twice fails the second time; an existing session still counts.
    if (error && !(await supabase.auth.getSession()).data.session) {
      failed.value = true
      return
    }
  }
  // Older links come back with a PKCE code that supabase-js exchanges on initialisation.
  await auth.whenReady()
  const params = new URLSearchParams(window.location.search)
  if (params.get('error') || window.location.hash.includes('error=')) {
    failed.value = true
    return
  }
  for (let i = 0; i < 40 && !auth.isSignedIn.value; i++) {
    await new Promise((r) => setTimeout(r, 150))
    const { data } = await supabase.auth.getSession()
    if (data.session) break
  }
  if (!auth.isSignedIn.value) {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      failed.value = true
      return
    }
  }
  const target = auth.consumeRedirect()
  await router.replace(auth.hasProfile.value ? target : { name: 'onboarding', query: { redirect: target } })
})
</script>

<template>
  <div class="screen-fixed brand-gradient items-center justify-center px-6 text-center text-white">
    <img :src="`${baseUrl}icons/icon.svg`" alt="" width="88" height="88" class="rounded-3xl shadow-float" />
    <template v-if="failed">
      <h1 class="mt-6 text-xl font-bold">{{ t('auth.callbackError') }}</h1>
      <RouterLink :to="{ name: 'signin' }" class="btn mt-4 bg-white text-brand-800">{{ t('auth.backToSignIn') }}</RouterLink>
    </template>
    <template v-else>
      <span class="mt-6 h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" aria-hidden="true"></span>
      <p role="status" class="mt-3 text-sm text-white/85">{{ t('auth.callbackTitle') }}</p>
    </template>
  </div>
</template>
