<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import TabBar from '@/components/TabBar.vue'
import ToastHost from '@/components/ToastHost.vue'

const { t } = useI18n()
const route = useRoute()
const showTabs = computed(() => route.meta.layout === 'tabs')

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
  <div class="flex h-full flex-col">
    <a href="#main" class="sr-only-focusable">{{ t('app.skipToContent') }}</a>
    <div v-if="!online" role="status" class="shrink-0 bg-amber-100 px-4 pt-safe text-center text-xs font-medium text-amber-900">
      <p class="py-1.5">{{ t('app.offline') }}</p>
    </div>
    <main id="main" class="relative min-h-0 flex-1">
      <RouterView />
    </main>
    <TabBar v-if="showTabs" />
    <ToastHost />
  </div>
</template>
