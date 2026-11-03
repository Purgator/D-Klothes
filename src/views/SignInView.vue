<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { errorKey } from '@/lib/errors'
import { isConfigured } from '@/lib/supabase'

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()

const email = ref('')
const sending = ref(false)
const sentTo = ref<string | null>(null)
const error = ref<string | null>(null)

const redirectPath = computed(() => {
  const r = route.query.redirect
  return typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') ? r : '/'
})

async function submit() {
  error.value = null
  const value = email.value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error.value = 'auth.invalidEmail'
    return
  }
  sending.value = true
  try {
    await auth.signInWithEmail(value, redirectPath.value)
    sentTo.value = value
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <section class="mx-auto mt-6 max-w-md">
    <h1 class="mb-1 text-2xl font-semibold">{{ t('auth.title') }}</h1>
    <p class="mb-6 text-sm text-stone-600">{{ t('app.tagline') }}</p>

    <div v-if="sentTo" class="card flex flex-col gap-3" role="status">
      <p>{{ t('auth.sent', { email: sentTo }) }}</p>
      <p class="text-sm text-stone-600">{{ t('auth.sentHint') }}</p>
      <button type="button" class="btn-secondary self-start" @click="sentTo = null">{{ t('app.back') }}</button>
    </div>

    <p v-else-if="!isConfigured" class="alert-warning" role="alert">{{ t('app.notConfigured') }}</p>

    <!-- Named and typed like a plain sign-in form so browsers, password managers and
         email-alias extensions recognise the field and offer to fill or remember it. -->
    <form v-else id="signin" name="signin" method="post" action="." class="card flex flex-col gap-4" novalidate @submit.prevent="submit">
      <p class="text-sm text-stone-700">{{ t('auth.intro') }}</p>
      <div>
        <label for="email" class="label">{{ t('auth.email') }}</label>
        <input
          id="email"
          v-model="email"
          type="email"
          name="email"
          autocomplete="username"
          inputmode="email"
          enterkeyhint="send"
          spellcheck="false"
          autocapitalize="off"
          required
          class="input"
          :placeholder="t('auth.emailPlaceholder')"
          :aria-invalid="error === 'auth.invalidEmail' ? 'true' : undefined"
          aria-describedby="email-error"
        />
        <p v-if="error" id="email-error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
      </div>
      <button type="submit" class="btn-primary" :disabled="sending">
        {{ sending ? t('auth.sending') : t('auth.sendLink') }}
      </button>
      <p class="text-xs text-stone-500">{{ t('auth.privacy') }}</p>
    </form>
  </section>
</template>
