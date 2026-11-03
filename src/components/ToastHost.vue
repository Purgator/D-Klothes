<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
const tones = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  info: 'border-brand-100 bg-brand-50 text-brand-800',
  error: 'border-red-200 bg-red-50 text-red-800',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
    <TransitionGroup name="toast">
      <button
        v-for="toast in toasts"
        :key="toast.id"
        type="button"
        class="pointer-events-auto flex max-w-sm items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg"
        :class="tones[toast.tone]"
        @click="dismiss(toast.id)"
      >
        <span v-if="toast.emoji" aria-hidden="true">{{ toast.emoji }}</span>
        <span>{{ toast.text }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(0.75rem) scale(0.95);
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active {
    transition: none;
  }
}
</style>
