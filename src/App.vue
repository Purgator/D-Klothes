<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppHeader from '@/components/AppHeader.vue'

const { t } = useI18n()
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const setOnline = () => (online.value = navigator.onLine)
onMounted(() => {
  window.addEventListener('online', setOnline)
  window.addEventListener('offline', setOnline)
})
onUnmounted(() => {
  window.removeEventListener('online', setOnline)
  window.removeEventListener('offline', setOnline)
})
</script>

<template>
  <a href="#main" class="sr-only-focusable">{{ t('app.skipToContent') }}</a>
  <AppHeader />
  <div v-if="!online" role="status" class="mx-auto mt-3 max-w-3xl px-4">
    <p class="alert-warning">{{ t('app.offline') }}</p>
  </div>
  <main id="main" class="mx-auto w-full max-w-3xl px-4 pb-16 pt-4">
    <RouterView />
  </main>
</template>
