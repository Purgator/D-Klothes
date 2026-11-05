<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { errorKey } from '@/lib/errors'
import { isConfigured } from '@/lib/supabase'
import AppIcon from '@/components/AppIcon.vue'
import Illustration from '@/components/Illustration.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

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
  <div class="screen-scroll brand-gradient flex flex-col">
    <div class="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-safe">
      <RouterLink :to="{ name: 'welcome' }" class="btn-icon mt-2 text-white hover:bg-white/15" :aria-label="t('app.back')"><AppIcon name="arrow-left" /></RouterLink>
      <LanguageSwitcher light class="mt-2" />
    </div>
    <div class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-end px-6 pb-6 pt-2 text-center text-white">
      <Illustration :name="sentTo ? 'mail' : 'hero'" class="w-48 max-w-[50%]" />
      <h1 class="mt-4 text-3xl font-black tracking-tight">{{ sentTo ? t('auth.sentTitle') : t('auth.title') }}</h1>
      <p class="mt-2 max-w-sm text-sm text-white/80">{{ sentTo ? t('auth.sent', { email: sentTo }) : t('app.tagline') }}</p>
    </div>

    <div class="mx-auto w-full max-w-lg rounded-t-4xl bg-white px-6 pb-safe pt-6 shadow-2xl">
      <div v-if="sentTo" class="flex flex-col gap-3 pb-6" role="status">
        <p class="alert-info">{{ t('auth.sentHint') }}</p>
        <button type="button" class="btn-secondary" @click="sentTo = null">{{ t('auth.anotherEmail') }}</button>
      </div>

      <p v-else-if="!isConfigured" class="alert-warning mb-6" role="alert">{{ t('app.notConfigured') }}</p>

      <!-- Named and typed like a plain sign-in form so browsers, password managers and
           email-alias extensions recognise the field and offer to fill or remember it. -->
      <form v-else id="signin" name="signin" method="post" action="." class="flex flex-col gap-4 pb-6" novalidate @submit.prevent="submit">
        <p class="text-sm text-stone-600">{{ t('auth.intro') }}</p>
        <div>
          <label for="email" class="label">{{ t('auth.email') }}</label>
          <div class="relative">
            <AppIcon name="mail" size="20" class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
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
              class="input pl-12"
              :placeholder="t('auth.emailPlaceholder')"
              :aria-invalid="error === 'auth.invalidEmail' ? 'true' : undefined"
              aria-describedby="email-error"
            />
          </div>
          <p v-if="error" id="email-error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
        </div>
        <button type="submit" class="btn-primary" :disabled="sending">
          <AppIcon name="send" size="20" /> {{ sending ? t('auth.sending') : t('auth.sendLink') }}
        </button>
        <p class="flex gap-2 text-xs text-stone-500"><AppIcon name="lock" size="16" class="mt-0.5 shrink-0 text-brand-600" /> {{ t('auth.privacy') }}</p>
      </form>
    </div>
  </div>
</template>
