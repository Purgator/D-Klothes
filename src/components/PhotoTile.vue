<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PhotoImage from '@/components/PhotoImage.vue'
import { VOTE_EMOJI } from '@/lib/votes'
import type { ClothingItem, VoteCounts, VoteType } from '@/types/database'

const props = defineProps<{ item: ClothingItem; counts: VoteCounts; myVote: VoteType | null; isMine: boolean }>()
const { t } = useI18n()

const alt = computed(() => (props.item.title ? t('item.photoAlt', { title: props.item.title }) : t('item.photoAltUntitled')))
const label = computed(() => `${props.item.title || t('home.untitled')}. ${t('vote.counts', { keep: props.counts.keep_count, letGo: props.counts.let_go_count, want: props.counts.want_count })}`)
</script>

<template>
  <RouterLink
    :to="{ name: 'item', params: { groupId: item.group_id, itemId: item.id } }"
    class="group relative block overflow-hidden rounded-2xl bg-stone-200 shadow-sm transition active:scale-[0.98]"
    :aria-label="label"
  >
    <PhotoImage :path="item.storage_path" :alt="alt" plain sizes-class="aspect-square" />
    <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-6 text-[11px] font-semibold text-white" aria-hidden="true">
      <span class="flex gap-1 tabular-nums">
        <span>{{ VOTE_EMOJI.keep }}{{ counts.keep_count }}</span>
        <span>{{ VOTE_EMOJI.let_go }}{{ counts.let_go_count }}</span>
        <span>{{ VOTE_EMOJI.want }}{{ counts.want_count }}</span>
      </span>
    </div>
    <span v-if="isMine" class="pill absolute left-1.5 top-1.5 bg-white/90 text-stone-800 shadow" aria-hidden="true">{{ t('group.you') }}</span>
    <span v-else-if="myVote" class="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-base shadow" aria-hidden="true">{{ VOTE_EMOJI[myVote] }}</span>
    <span v-else class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-white" aria-hidden="true"></span>
  </RouterLink>
</template>
