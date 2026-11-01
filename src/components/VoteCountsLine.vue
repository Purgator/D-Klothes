<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { VoteCounts } from '@/types/database'

defineProps<{ counts: VoteCounts }>()
const { t } = useI18n()
</script>

<template>
  <ul class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-600" :aria-label="t('vote.prompt')">
    <li><span class="font-semibold text-emerald-700">{{ counts.keep_count }}</span> {{ t('vote.keep') }}</li>
    <li><span class="font-semibold text-amber-700">{{ counts.let_go_count }}</span> {{ t('vote.let_go') }}</li>
    <li><span class="font-semibold text-rose-700">{{ counts.want_count }}</span> {{ t('vote.want') }}</li>
  </ul>
</template>
