<script setup lang="ts">
import { toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePhotoUrl } from '@/composables/usePhotoUrl'

const props = defineProps<{ path: string; alt: string; sizesClass?: string }>()
const { t } = useI18n()
const { url, failed, reload } = usePhotoUrl(toRef(props, 'path'))
</script>

<template>
  <div class="relative overflow-hidden rounded-lg bg-stone-100" :class="sizesClass ?? 'aspect-[4/5]'">
    <img v-if="url" :src="url" :alt="alt" class="h-full w-full object-cover" loading="lazy" decoding="async" />
    <div v-else-if="failed" class="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-stone-500">
      <span>{{ t('errors.unknown') }}</span>
      <button type="button" class="btn-secondary" @click="reload">{{ t('app.retry') }}</button>
    </div>
    <div v-else class="h-full w-full animate-pulse" role="status" :aria-label="t('app.loading')"></div>
  </div>
</template>
