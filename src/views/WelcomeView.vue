<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import Illustration from '@/components/Illustration.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import ShareButton from '@/components/ShareButton.vue'

const { t } = useI18n()
const auth = useAuth()

const steps = ['photo', 'friends', 'decide'] as const
const platforms = ['ios', 'android', 'desktop'] as const
const privacyIcons: IconName[] = ['lock', 'eye', 'shield', 'clock']
</script>

<template>
  <div class="screen-scroll bg-stone-100">
    <header class="brand-gradient rounded-b-4xl pb-10 pt-safe text-white">
      <div class="mx-auto flex max-w-lg items-center justify-between px-4 pt-3">
        <span class="text-sm font-bold tracking-wide text-white/80">{{ t('app.name') }}</span>
        <LanguageSwitcher light />
      </div>
      <div class="mx-auto flex max-w-lg flex-col items-center px-6 pt-4 text-center">
        <Illustration name="hero" class="w-56 max-w-[60%]" />
        <h1 class="mt-4 text-3xl font-black tracking-tight">{{ t('welcome.title') }}</h1>
        <p class="mt-3 max-w-md text-sm leading-relaxed text-white/85">{{ t('welcome.lead') }}</p>
        <div class="mt-6 flex w-full max-w-xs flex-col gap-2">
          <RouterLink :to="{ name: auth.isSignedIn.value ? 'home' : 'signin' }" class="btn bg-white text-brand-800 shadow-float hover:bg-brand-50">
            <AppIcon :name="auth.isSignedIn.value ? 'cards' : 'log-in'" size="20" /> {{ auth.isSignedIn.value ? t('welcome.openApp') : t('welcome.cta') }}
          </RouterLink>
          <ShareButton light />
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-lg px-4 pb-12">
      <section aria-labelledby="how-title">
        <h2 id="how-title" class="section-title mt-8">{{ t('welcome.howTitle') }}</h2>
        <ol class="flex flex-col gap-3">
          <li v-for="(step, i) in steps" :key="step" class="card flex items-start gap-3">
            <span class="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden="true">
              {{ t(`welcome.steps.${step}.emoji`) }}
              <span class="absolute -left-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">{{ i + 1 }}</span>
            </span>
            <span>
              <h3 class="font-semibold">{{ t(`welcome.steps.${step}.title`) }}</h3>
              <p class="mt-0.5 text-sm text-stone-600">{{ t(`welcome.steps.${step}.body`) }}</p>
            </span>
          </li>
        </ol>
        <p class="alert-info mt-3">{{ t('vote.advice') }}</p>
      </section>

      <section aria-labelledby="install-title">
        <h2 id="install-title" class="section-title mt-8">{{ t('welcome.installTitle') }}</h2>
        <p class="mb-3 px-1 text-sm text-stone-600">{{ t('welcome.installLead') }}</p>
        <div class="list-group">
          <details v-for="(p, i) in platforms" :key="p" :open="i === 0">
            <summary class="list-row cursor-pointer font-medium">
              <AppIcon name="smartphone" size="20" class="text-stone-500" /> <span class="flex-1">{{ t(`welcome.install.${p}.title`) }}</span>
              <AppIcon name="chevron-down" size="18" class="text-stone-400" />
            </summary>
            <ol class="list-inside list-decimal space-y-1 px-4 pb-4 text-sm text-stone-700">
              <li v-for="n in 3" :key="n">{{ t(`welcome.install.${p}.step${n}`) }}</li>
            </ol>
          </details>
        </div>
        <p class="help px-1">{{ t('welcome.installHint') }}</p>
      </section>

      <section aria-labelledby="privacy-title">
        <h2 id="privacy-title" class="section-title mt-8">{{ t('welcome.privacyTitle') }}</h2>
        <ul class="list-group">
          <li v-for="n in 4" :key="n" class="list-row text-sm text-stone-700">
            <AppIcon :name="privacyIcons[n - 1]!" size="20" class="shrink-0 text-brand-600" /> <span>{{ t(`welcome.privacy${n}`) }}</span>
          </li>
        </ul>
      </section>

      <footer class="mt-10 flex flex-col items-center gap-3 text-center">
        <p class="text-sm text-stone-600">{{ t('welcome.inviteOnly') }}</p>
        <RouterLink v-if="!auth.isSignedIn.value" :to="{ name: 'signin' }" class="btn-primary">{{ t('welcome.cta') }}</RouterLink>
        <a href="https://github.com/Purgator/D-Klothes" rel="noopener" class="text-xs text-stone-400 underline">{{ t('welcome.source') }}</a>
      </footer>
    </div>
  </div>
</template>
