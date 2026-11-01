<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale, isSupportedLocale } from '@/i18n'

const { t, locale } = useI18n()

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isSupportedLocale(value)) setLocale(value)
}
</script>

<template>
  <label class="flex items-center gap-1 text-sm">
    <span class="sr-only">{{ t('language.label') }}</span>
    <select class="input min-h-10 w-auto py-1 text-sm" :value="locale" @change="onChange">
      <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code">{{ t(`language.${code}`) }}</option>
    </select>
  </label>
</template>
