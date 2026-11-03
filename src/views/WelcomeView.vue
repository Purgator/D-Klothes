<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import ShareButton from '@/components/ShareButton.vue'

const { t } = useI18n()
const auth = useAuth()
const baseUrl = import.meta.env.BASE_URL

const steps = ['photo', 'friends', 'decide'] as const
const platforms = ['ios', 'android', 'desktop'] as const
</script>

<template>
  <article class="mx-auto flex max-w-2xl flex-col gap-8">
    <div class="flex justify-end">
      <LanguageSwitcher />
    </div>

    <header class="flex flex-col items-center gap-3 text-center">
      <img :src="`${baseUrl}icons/icon.svg`" alt="" width="72" height="72" class="rounded-2xl shadow-sm" />
      <h1 class="text-3xl font-semibold text-brand-800">{{ t('welcome.title') }}</h1>
      <p class="max-w-md text-stone-700">{{ t('welcome.lead') }}</p>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        <RouterLink :to="{ name: auth.isSignedIn.value ? 'home' : 'signin' }" class="btn-primary">
          {{ auth.isSignedIn.value ? t('nav.home') : t('welcome.cta') }}
        </RouterLink>
        <ShareButton />
      </div>
    </header>

    <section aria-labelledby="how-title">
      <h2 id="how-title" class="mb-3 text-xl font-medium">{{ t('welcome.howTitle') }}</h2>
      <ol class="grid gap-3 sm:grid-cols-3">
        <li v-for="(step, i) in steps" :key="step" class="card flex flex-col gap-1">
          <span class="text-2xl" aria-hidden="true">{{ t(`welcome.steps.${step}.emoji`) }}</span>
          <h3 class="font-medium">{{ i + 1 }}. {{ t(`welcome.steps.${step}.title`) }}</h3>
          <p class="text-sm text-stone-600">{{ t(`welcome.steps.${step}.body`) }}</p>
        </li>
      </ol>
      <p class="alert-info mt-3">{{ t('vote.advice') }}</p>
    </section>

    <section aria-labelledby="install-title">
      <h2 id="install-title" class="mb-1 text-xl font-medium">{{ t('welcome.installTitle') }}</h2>
      <p class="mb-3 text-sm text-stone-600">{{ t('welcome.installLead') }}</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="p in platforms" :key="p" class="card">
          <h3 class="mb-2 font-medium">{{ t(`welcome.install.${p}.title`) }}</h3>
          <ol class="list-inside list-decimal space-y-1 text-sm text-stone-700">
            <li v-for="n in 3" :key="n">{{ t(`welcome.install.${p}.step${n}`) }}</li>
          </ol>
        </div>
      </div>
      <p class="help mt-2">{{ t('welcome.installHint') }}</p>
    </section>

    <section aria-labelledby="privacy-title" class="card">
      <h2 id="privacy-title" class="mb-2 text-xl font-medium">{{ t('welcome.privacyTitle') }}</h2>
      <ul class="list-inside list-disc space-y-1 text-sm text-stone-700">
        <li v-for="n in 4" :key="n">{{ t(`welcome.privacy${n}`) }}</li>
      </ul>
    </section>

    <footer class="flex flex-col items-center gap-3 text-center">
      <p class="text-sm text-stone-600">{{ t('welcome.inviteOnly') }}</p>
      <RouterLink v-if="!auth.isSignedIn.value" :to="{ name: 'signin' }" class="btn-primary">{{ t('welcome.cta') }}</RouterLink>
      <a href="https://github.com/Purgator/D-Klothes" rel="noopener" class="text-xs text-stone-400 underline">{{ t('welcome.source') }}</a>
    </footer>
  </article>
</template>
