<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SUPPORTED_LOCALES, setLocale, isSupportedLocale } from '@/i18n'

defineProps<{ light?: boolean }>()
const { t, locale } = useI18n()

function onChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isSupportedLocale(value)) setLocale(value)
}
</script>

<template>
  <label class="flex items-center gap-1 text-sm">
    <span class="sr-only">{{ t('language.label') }}</span>
    <select
      class="min-h-10 rounded-full px-3 py-1 text-sm font-medium"
      :class="light ? 'bg-white/15 text-white ring-1 ring-white/40' : 'bg-white text-stone-800 ring-1 ring-stone-200'"
      :value="locale"
      @change="onChange"
    >
      <option v-for="code in SUPPORTED_LOCALES" :key="code" :value="code" class="text-stone-900">{{ t(`language.${code}`) }}</option>
    </select>
  </label>
</template>
