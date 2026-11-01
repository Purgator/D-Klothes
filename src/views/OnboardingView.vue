<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { errorKey } from '@/lib/errors'

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
  <section class="mx-auto mt-6 max-w-md">
    <h1 class="mb-1 text-2xl font-semibold">{{ t('onboarding.title') }}</h1>
    <p class="mb-6 text-sm text-stone-600">{{ t('onboarding.intro') }}</p>
    <form class="card flex flex-col gap-4" novalidate @submit.prevent="submit">
      <div>
        <label for="display-name" class="label">{{ t('onboarding.displayName') }}</label>
        <input
          id="display-name"
          v-model="name"
          type="text"
          maxlength="50"
          autocomplete="nickname"
          required
          class="input"
          :placeholder="t('onboarding.displayNamePlaceholder')"
          aria-describedby="display-name-help"
        />
        <p id="display-name-help" class="help">{{ t('onboarding.displayNameHelp') }}</p>
        <p v-if="error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
      </div>
      <button type="submit" class="btn-primary" :disabled="saving">{{ t('onboarding.continue') }}</button>
    </form>
  </section>
</template>
