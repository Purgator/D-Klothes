<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    /** Where the back arrow leads when the app was opened straight on this screen. */
    back?: RouteLocationRaw | null
    /** Draw over the content instead of in a solid bar (photo screens). */
    transparent?: boolean
    light?: boolean
  }>(),
  { title: '', back: null, transparent: false, light: false },
)
const { t } = useI18n()
const router = useRouter()

function goBack() {
  if (!props.back) return
  // Pop the real history when there is one, so iOS swipe-back and the arrow agree.
  if (typeof window !== 'undefined' && window.history.state?.back) router.back()
  else void router.replace(props.back)
}
</script>

<template>
  <header
    class="z-20 shrink-0 pt-safe"
    :class="transparent ? 'absolute inset-x-0 top-0' : 'sticky top-0 bg-stone-100/90 backdrop-blur'"
  >
    <div class="mx-auto flex h-14 max-w-lg items-center gap-1 px-2" :class="light ? 'text-white' : 'text-stone-900'">
      <slot name="leading">
        <button
          v-if="back"
          type="button"
          class="btn-icon"
          :class="light ? 'bg-black/30 text-white hover:bg-black/40' : ''"
          :aria-label="t('app.back')"
          @click="goBack"
        >
          <AppIcon name="arrow-left" />
        </button>
        <span v-else class="w-2" aria-hidden="true"></span>
      </slot>
      <h1 class="min-w-0 flex-1 truncate px-1 text-lg font-bold tracking-tight">
        <slot name="title">{{ title }}</slot>
      </h1>
      <div class="flex shrink-0 items-center gap-1">
        <slot name="trailing" />
      </div>
    </div>
  </header>
</template>
