<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuth()
const baseUrl = import.meta.env.BASE_URL

async function signOut() {
  await auth.signOut()
  await router.push({ name: 'signin' })
}
</script>

<template>
  <header class="border-b border-stone-200 bg-white">
    <nav class="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3" :aria-label="t('app.name')">
      <RouterLink :to="{ name: auth.isSignedIn.value ? 'home' : 'signin' }" class="flex items-center gap-2 font-semibold text-brand-800">
        <img :src="`${baseUrl}icons/icon.svg`" alt="" width="28" height="28" class="rounded-md" />
        <span>{{ t('app.name') }}</span>
      </RouterLink>
      <div class="flex items-center gap-2">
        <LanguageSwitcher />
        <template v-if="auth.isSignedIn.value">
          <RouterLink :to="{ name: 'account' }" class="btn-secondary px-3" :aria-label="t('nav.account')">
            <span class="hidden sm:inline">{{ auth.profile.value?.display_name ?? t('nav.account') }}</span>
            <span class="sm:hidden" aria-hidden="true">👤</span>
          </RouterLink>
          <button type="button" class="btn-secondary px-3" @click="signOut">{{ t('nav.signOut') }}</button>
        </template>
      </div>
    </nav>
  </header>
</template>
