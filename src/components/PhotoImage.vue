<script setup lang="ts">
import { onMounted, onUnmounted, ref, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePhotoUrl } from '@/composables/usePhotoUrl'

const props = defineProps<{
  path: string
  alt: string
  sizesClass?: string
  /** No rounded corners: the parent clips the image itself. */
  plain?: boolean
}>()
const { t } = useI18n()

// The photo is fetched by script (see usePhotoUrl), so the browser's lazy loading of <img>
// cannot hold it back: wait until the tile is close to the screen before downloading.
const root = ref<HTMLElement | null>(null)
const near = ref(typeof IntersectionObserver === 'undefined')
let observer: IntersectionObserver | null = null
onMounted(() => {
  if (near.value || !root.value) return
  observer = new IntersectionObserver(
    (seen) => {
      if (!seen.some((entry) => entry.isIntersecting)) return
      near.value = true
      observer?.disconnect()
      observer = null
    },
    { rootMargin: '400px' },
  )
  observer.observe(root.value)
})
onUnmounted(() => observer?.disconnect())

const { url, failed, reload } = usePhotoUrl(toRef(props, 'path'), near)
</script>

<template>
  <div ref="root" class="relative overflow-hidden bg-stone-200" :class="[sizesClass ?? 'aspect-[4/5]', plain ? '' : 'rounded-2xl']">
    <img v-if="url" :src="url" :alt="alt" class="h-full w-full object-cover" decoding="async" />
    <div v-else-if="failed" class="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center text-sm text-stone-500">
      <span>{{ t('errors.unknown') }}</span>
      <button type="button" class="btn-secondary btn-sm" @click="reload">{{ t('app.retry') }}</button>
    </div>
    <div v-else class="h-full w-full animate-pulse" role="status" :aria-label="t('app.loading')"></div>
  </div>
</template>
