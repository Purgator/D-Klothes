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
  keep: 'border-emerald-300 text-emerald-800 aria-pressed:bg-emerald-600 aria-pressed:text-white aria-pressed:border-emerald-600',
  let_go: 'border-amber-300 text-amber-800 aria-pressed:bg-amber-600 aria-pressed:text-white aria-pressed:border-amber-600',
  want: 'border-rose-300 text-rose-800 aria-pressed:bg-rose-600 aria-pressed:text-white aria-pressed:border-rose-600',
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2" role="group" :aria-label="t('vote.prompt')">
      <button
        v-for="type in VOTE_TYPES"
        :key="type"
        type="button"
        class="btn flex-1 border bg-white hover:bg-stone-50"
        :class="styles[type]"
        :aria-pressed="current === type"
        :disabled="busy"
        @click="choose(type)"
      >
        <span aria-hidden="true">{{ VOTE_EMOJI[type] }}</span> {{ t(`vote.${type}`) }}
      </button>
    </div>
    <p v-if="current" class="mt-2 text-xs text-stone-600">
      {{ t('vote.yourVote', { vote: t(`vote.${current}`) }) }}
    </p>
    <p v-if="error" class="alert-error mt-2" role="alert">{{ t(error) }}</p>
  </div>
</template>
