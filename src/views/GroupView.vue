<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import ItemCard from '@/components/ItemCard.vue'
import PageTitle from '@/components/PageTitle.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)
</script>

<template>
  <section>
    <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>
    <template v-else-if="feed.group.value">
      <PageTitle :title="feed.group.value.name" :back-to="{ name: 'home' }" :back-label="t('nav.home')">
        <template #actions>
          <RouterLink :to="{ name: 'group-settings', params: { groupId } }" class="btn-secondary">{{ t('group.settings') }}</RouterLink>
          <RouterLink :to="{ name: 'upload', params: { groupId } }" class="btn-primary">{{ t('group.addPhoto') }}</RouterLink>
        </template>
      </PageTitle>

      <div class="mb-3 flex items-center justify-between text-xs text-stone-500">
        <span>
          <span
            class="mr-1 inline-block h-2 w-2 rounded-full"
            :class="feed.live.value ? 'bg-emerald-500' : 'bg-stone-300'"
            aria-hidden="true"
          ></span>
          {{ t('group.liveUpdates') }}
        </span>
        <button type="button" class="underline" @click="feed.load">{{ t('group.refresh') }}</button>
      </div>

      <p v-if="feed.error.value" class="alert-error mb-3" role="alert">{{ t(feed.error.value) }}</p>
      <p class="alert-info mb-4">{{ t('vote.advice') }}</p>

      <p v-if="!feed.items.value.length" class="card text-sm text-stone-600">{{ t('group.emptyFeed') }}</p>
      <div v-else class="grid gap-4 sm:grid-cols-2">
        <ItemCard
          v-for="item in feed.items.value"
          :key="item.id"
          :item="item"
          :counts="feed.countsFor(item.id)"
          :my-vote="feed.myVotes.value.get(item.id) ?? null"
          :uploader-name="feed.memberNames.value.get(item.uploader_id) ?? '?'"
          :is-mine="item.uploader_id === userId"
          :vote="feed.vote"
        />
      </div>
    </template>
  </section>
</template>
