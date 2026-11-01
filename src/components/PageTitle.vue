<script setup lang="ts">
defineProps<{ title: string; backTo?: { name: string; params?: Record<string, string> } | null; backLabel?: string }>()
</script>

<template>
  <div class="mb-4 flex flex-col gap-2">
    <RouterLink v-if="backTo" :to="backTo" class="text-sm text-brand-700 hover:underline">← {{ backLabel }}</RouterLink>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h1 class="text-2xl font-semibold">{{ title }}</h1>
      <div class="flex gap-2"><slot name="actions" /></div>
    </div>
  </div>
</template>
