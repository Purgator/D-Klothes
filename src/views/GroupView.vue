<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { useNotifications } from '@/composables/useNotifications'
import ItemCard from '@/components/ItemCard.vue'
import PageTitle from '@/components/PageTitle.vue'

const { t } = useI18n()
const route = useRoute()
const auth = useAuth()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)
const toReview = computed(
  () => feed.items.value.filter((i) => i.uploader_id !== userId.value && !feed.myVotes.value.has(i.id)).length,
)

// Owners: how many membership requests are waiting (refreshed with the feed and via notifications).
const pendingRequests = ref(0)
const notifications = useNotifications()
async function loadPending() {
  if (!feed.isOwner.value) {
    pendingRequests.value = 0
    return
  }
  const { count } = await supabase
    .from('membership_requests')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', groupId.value)
    .eq('status', 'pending')
  pendingRequests.value = count ?? 0
}
watch([() => feed.isOwner.value, () => notifications.items.value], loadPending, { immediate: true })
</script>

<template>
  <section>
    <p v-if="feed.loading.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>
    <template v-else-if="feed.group.value">
      <PageTitle :title="feed.group.value.name" :back-to="{ name: 'home' }" :back-label="t('nav.home')">
        <template #actions>
          <RouterLink :to="{ name: 'group-settings', params: { groupId } }" class="btn-secondary">{{ t('group.settings') }}</RouterLink>
          <RouterLink v-if="toReview > 0" :to="{ name: 'swipe', params: { groupId } }" class="btn-secondary">
            {{ t('swipe.open') }} <span class="rounded-full bg-brand-100 px-2 text-xs text-brand-800">{{ toReview }}</span>
          </RouterLink>
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
      <RouterLink
        v-if="feed.isOwner.value && pendingRequests > 0"
        :to="{ name: 'group-settings', params: { groupId }, hash: '#requests-title' }"
        class="alert-warning mb-3 flex items-center justify-between gap-3 hover:border-amber-400"
      >
        <span>{{ t('group.pendingRequests', { count: pendingRequests }, pendingRequests) }}</span>
        <span class="font-medium underline">{{ t('group.reviewRequests') }}</span>
      </RouterLink>
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
