<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import AppIcon from '@/components/AppIcon.vue'

defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" :aria-label="title">
        <div class="sheet-backdrop absolute inset-0 bg-stone-900/40" @click="emit('close')"></div>
        <div class="sheet-panel relative flex max-h-[85%] w-full max-w-lg flex-col rounded-t-4xl bg-white pb-safe shadow-2xl">
          <div class="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-stone-300" aria-hidden="true"></div>
          <header class="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-3">
            <h2 class="text-lg font-bold">{{ title }}</h2>
            <button type="button" class="btn-icon -mr-2" :aria-label="t('app.close')" @click="emit('close')"><AppIcon name="x" /></button>
          </header>
          <div class="min-h-0 overflow-y-auto px-4 pb-4"><slot /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 220ms ease;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}
@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active .sheet-panel,
  .sheet-leave-active .sheet-panel {
    transition: none;
  }
}
</style>
