<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { errorKey } from '@/lib/errors'
import AppIcon from '@/components/AppIcon.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()

const name = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

async function submit() {
  const value = name.value.trim()
  if (value.length < 1 || value.length > 50) {
    error.value = 'onboarding.displayNameHelp'
    return
  }
  saving.value = true
  error.value = null
  try {
    await auth.saveDisplayName(value)
    const r = route.query.redirect
    await router.replace(typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : { name: 'home' })
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="screen-scroll brand-gradient flex flex-col">
    <div class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-end px-6 pb-8 pt-safe text-center text-white">
      <span class="mt-10 inline-flex h-20 w-20 items-center justify-center rounded-full bg-white/15 text-4xl" aria-hidden="true">👋</span>
      <h1 class="mt-4 text-3xl font-black tracking-tight">{{ t('onboarding.title') }}</h1>
      <p class="mt-2 max-w-sm text-sm text-white/80">{{ t('onboarding.intro') }}</p>
    </div>
    <form class="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-t-4xl bg-white px-6 pb-safe pt-6 shadow-2xl" novalidate @submit.prevent="submit">
      <div class="pb-6">
        <label for="display-name" class="label">{{ t('onboarding.displayName') }}</label>
        <div class="relative">
          <AppIcon name="user" size="20" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            id="display-name"
            v-model="name"
            type="text"
            maxlength="50"
            autocomplete="nickname"
            required
            class="input pl-12"
            :placeholder="t('onboarding.displayNamePlaceholder')"
            aria-describedby="display-name-help"
          />
        </div>
        <p id="display-name-help" class="help">{{ t('onboarding.displayNameHelp') }}</p>
        <p v-if="error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
        <button type="submit" class="btn-primary mt-4 w-full" :disabled="saving">{{ t('onboarding.continue') }} <AppIcon name="chevron-right" size="20" /></button>
      </div>
    </form>
  </div>
</template>
