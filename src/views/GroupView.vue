<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { useGroupFeed } from '@/composables/useGroupFeed'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { useNotifications } from '@/composables/useNotifications'
import AppIcon from '@/components/AppIcon.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'
import Illustration from '@/components/Illustration.vue'
import PhotoTile from '@/components/PhotoTile.vue'
import TopBar from '@/components/TopBar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const overview = useGroupsOverview()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)
const toReview = computed(() => feed.items.value.filter((i) => i.uploader_id !== userId.value && !feed.myVotes.value.has(i.id)).length)

// Owners: how many membership requests are waiting (refreshed with the feed and via notifications).
const pendingRequests = ref(0)
const notifications = useNotifications()
async function loadPending() {
  if (!feed.isOwner.value) {
    pendingRequests.value = 0
    return
  }
  const { count } = await supabase.from('membership_requests').select('id', { count: 'exact', head: true }).eq('group_id', groupId.value).eq('status', 'pending')
  pendingRequests.value = count ?? 0
}
watch([() => feed.isOwner.value, () => notifications.items.value], loadPending, { immediate: true })

function review() {
  overview.selectGroup(groupId.value)
  void router.push({ name: 'home' })
}
</script>

<template>
  <div class="screen-fixed">
    <TopBar :title="feed.group.value?.name ?? ''" :back="{ name: 'groups' }">
      <template #trailing>
        <RouterLink :to="{ name: 'group-settings', params: { groupId } }" class="btn-icon" :aria-label="t('group.settings')" :title="t('group.settings')">
          <AppIcon name="sliders" />
        </RouterLink>
      </template>
    </TopBar>

    <div class="screen-scroll relative">
      <div class="screen-body pb-28">
        <div v-if="feed.loading.value" class="flex flex-col gap-3" role="status" :aria-label="t('app.loading')">
          <div class="h-24 animate-pulse rounded-3xl bg-stone-200"></div>
          <div class="grid grid-cols-3 gap-1.5"><div v-for="n in 6" :key="n" class="aspect-square animate-pulse rounded-2xl bg-stone-200"></div></div>
        </div>
        <p v-else-if="feed.notMember.value" class="alert-error" role="alert">{{ t('group.notMember') }}</p>

        <template v-else-if="feed.group.value">
          <header class="card mb-3 flex items-center gap-3">
            <GroupAvatar :name="feed.group.value.name" size="lg" />
            <div class="min-w-0 flex-1">
              <h2 class="truncate text-lg font-bold">{{ feed.group.value.name }}</h2>
              <p class="text-xs text-stone-500">
                {{ t('home.memberCount', { count: feed.members.value.length }, feed.members.value.length) }} ·
                {{ t('group.photoCount', { count: feed.items.value.length }, feed.items.value.length) }}
              </p>
              <p class="mt-1 flex flex-wrap gap-1">
                <span v-if="feed.isOwner.value" class="pill bg-amber-100 text-amber-900"><AppIcon name="crown" size="12" /> {{ t('home.ownerBadge') }}</span>
                <span class="pill" :class="feed.live.value ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-500'">
                  <span class="h-1.5 w-1.5 rounded-full" :class="feed.live.value ? 'bg-emerald-500' : 'bg-stone-400'" aria-hidden="true"></span>
                  {{ t('group.liveUpdates') }}
                </span>
              </p>
            </div>
          </header>

          <RouterLink
            v-if="feed.isOwner.value && pendingRequests > 0"
            :to="{ name: 'group-settings', params: { groupId }, hash: '#requests-title' }"
            class="alert-warning mb-3 flex items-center justify-between gap-3"
          >
            <span class="flex items-center gap-2"><AppIcon name="inbox" size="18" /> {{ t('group.pendingRequests', { count: pendingRequests }, pendingRequests) }}</span>
            <span class="font-semibold underline">{{ t('group.reviewRequests') }}</span>
          </RouterLink>

          <button v-if="toReview > 0" type="button" class="btn-primary mb-4 w-full" @click="review">
            <AppIcon name="cards" size="20" /> {{ t('group.reviewNow', { count: toReview }, toReview) }}
          </button>

          <p v-if="feed.error.value" class="alert-error mb-3" role="alert">{{ t(feed.error.value) }}</p>

          <div v-if="!feed.items.value.length" class="flex flex-col items-center gap-4 py-8 text-center">
            <Illustration name="wardrobe" class="w-52 max-w-[55%]" />
            <p class="text-sm text-stone-600">{{ feed.canUpload.value ? t('group.emptyFeed') : t('group.emptyFeedOwnerOnly') }}</p>
          </div>
          <div v-else class="grid grid-cols-3 gap-1.5">
            <PhotoTile
              v-for="item in feed.items.value"
              :key="item.id"
              :item="item"
              :counts="feed.countsFor(item.id)"
              :my-vote="feed.myVotes.value.get(item.id) ?? null"
              :is-mine="item.uploader_id === userId"
            />
          </div>
          <p class="mt-4 text-center text-xs text-stone-500">{{ t('vote.advice') }}</p>
        </template>
      </div>
    </div>

    <RouterLink
      v-if="feed.group.value && feed.canUpload.value"
      :to="{ name: 'upload', params: { groupId } }"
      class="fab absolute bottom-5 right-5 mb-safe"
      :aria-label="t('group.addPhoto')"
      :title="t('group.addPhoto')"
    >
      <AppIcon name="camera" size="26" />
    </RouterLink>
  </div>
</template>
