<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

// A stable colour per group name, so a group keeps its tint across screens.
const PALETTE = [
  'from-brand-400 to-brand-700',
  'from-rose-400 to-rose-600',
  'from-amber-400 to-orange-600',
  'from-sky-400 to-indigo-600',
  'from-violet-400 to-purple-600',
  'from-emerald-400 to-teal-600',
]
const tint = computed(() => {
  let h = 0
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
})
const initial = computed(() => (props.name.trim()[0] ?? '?').toUpperCase())
const sizes = { sm: 'h-9 w-9 rounded-xl text-sm', md: 'h-12 w-12 rounded-2xl text-lg', lg: 'h-16 w-16 rounded-3xl text-2xl' }
</script>

<template>
  <span
    class="inline-flex shrink-0 select-none items-center justify-center bg-gradient-to-br font-bold text-white shadow-sm"
    :class="[tint, sizes[size]]"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>
