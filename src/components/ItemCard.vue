<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import PhotoImage from '@/components/PhotoImage.vue'
import VoteButtons from '@/components/VoteButtons.vue'
import VoteCountsLine from '@/components/VoteCountsLine.vue'
import type { ClothingItem, VoteCounts, VoteType } from '@/types/database'

const props = defineProps<{
  item: ClothingItem
  counts: VoteCounts
  myVote: VoteType | null
  uploaderName: string
  isMine: boolean
  vote: (itemId: string, next: VoteType | null) => Promise<void>
}>()
const { t, d } = useI18n()

const alt = computed(() => (props.item.title ? t('item.photoAlt', { title: props.item.title }) : t('item.photoAltUntitled')))
</script>

<template>
  <article class="card flex flex-col gap-3 p-3">
    <RouterLink :to="{ name: 'item', params: { groupId: item.group_id, itemId: item.id } }" :aria-label="t('group.viewItem')">
      <PhotoImage :path="item.storage_path" :alt="alt" />
    </RouterLink>
    <div class="flex flex-col gap-1">
      <h3 class="font-medium leading-tight">
        <RouterLink :to="{ name: 'item', params: { groupId: item.group_id, itemId: item.id } }" class="hover:underline">
          {{ item.title || t('home.untitled') }}
        </RouterLink>
      </h3>
      <p class="text-xs text-stone-500">
        {{ t('group.uploadedBy', { name: isMine ? t('group.you') : uploaderName }) }} · {{ d(new Date(item.created_at), 'short') }}
      </p>
      <VoteCountsLine :counts="counts" />
    </div>
    <VoteButtons v-if="!isMine" :item-id="item.id" :current="myVote" :vote="vote" />
    <p v-else class="text-xs text-stone-500">{{ t('vote.ownItem') }}</p>
  </article>
</template>
