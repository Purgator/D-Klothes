<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { VOTE_TYPES, VOTE_EMOJI } from '@/lib/votes'
import { errorKey } from '@/lib/errors'
import { haptic, useToast } from '@/composables/useToast'
import type { VoteType } from '@/types/database'

const props = defineProps<{
  itemId: string
  current: VoteType | null
  vote: (itemId: string, next: VoteType | null) => Promise<void>
}>()
const { t } = useI18n()
const toast = useToast()
const busy = ref(false)
const error = ref<string | null>(null)

async function choose(next: VoteType) {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    const removing = props.current === next
    await props.vote(props.itemId, removing ? null : next)
    haptic()
    toast.show(removing ? t('toast.voteRemoved') : t('toast.voteSaved'), { emoji: removing ? '↩️' : VOTE_EMOJI[next] })
  } catch (err) {
    error.value = errorKey(err)
  } finally {
    busy.value = false
  }
}

const styles: Record<VoteType, string> = {
  keep: 'aria-pressed:border-keep-500 aria-pressed:bg-keep-500 aria-pressed:text-white',
  let_go: 'aria-pressed:border-letgo-500 aria-pressed:bg-letgo-500 aria-pressed:text-white',
  want: 'aria-pressed:border-want-500 aria-pressed:bg-want-500 aria-pressed:text-white',
}
</script>

<template>
  <div>
    <div class="grid grid-cols-3 gap-2" role="group" :aria-label="t('vote.prompt')">
      <button
        v-for="type in VOTE_TYPES"
        :key="type"
        type="button"
        class="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-stone-200 bg-white px-1 py-2 text-xs font-semibold text-stone-700 transition active:scale-95 disabled:opacity-50"
        :class="styles[type]"
        :aria-pressed="current === type"
        :disabled="busy"
        @click="choose(type)"
      >
        <span class="text-2xl" aria-hidden="true">{{ VOTE_EMOJI[type] }}</span>
        <span class="leading-tight">{{ t(`vote.${type}`) }}</span>
      </button>
    </div>
    <p v-if="current" class="mt-2 text-center text-xs text-stone-500">{{ t('vote.yourVote', { vote: t(`vote.${current}`) }) }} · {{ t('vote.tapToRemove') }}</p>
    <p v-if="error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
  </div>
</template>
