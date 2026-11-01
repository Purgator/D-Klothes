<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const failed = ref(false)

onMounted(async () => {
  // supabase-js exchanges the PKCE code in the URL on initialisation; wait for the session.
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
  <section class="mx-auto mt-10 max-w-md text-center">
    <template v-if="failed">
      <h1 class="mb-3 text-xl font-semibold">{{ t('auth.callbackError') }}</h1>
      <RouterLink :to="{ name: 'signin' }" class="btn-primary">{{ t('auth.backToSignIn') }}</RouterLink>
    </template>
    <p v-else role="status" class="text-stone-600">{{ t('auth.callbackTitle') }}</p>
  </section>
</template>
