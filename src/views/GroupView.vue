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
import BottomSheet from '@/components/BottomSheet.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'
import Illustration from '@/components/Illustration.vue'
import PhotoTile from '@/components/PhotoTile.vue'
import TopBar from '@/components/TopBar.vue'
import type { ClothingItem } from '@/types/database'

// Display filter and sort order of the collection; kept for the session, shared by all groups.
type Filter = 'all' | 'toReview' | 'mine' | 'reviewed'
type Sort = 'newest' | 'oldest' | 'keep' | 'letGo' | 'want' | 'title'
const FILTERS: Filter[] = ['all', 'toReview', 'mine', 'reviewed']
const SORTS: Sort[] = ['newest', 'oldest', 'keep', 'letGo', 'want', 'title']
const filter = ref<Filter>('all')
const sort = ref<Sort>('newest')

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuth()
const overview = useGroupsOverview()

const groupId = computed(() => String(route.params.groupId))
const userId = computed(() => auth.user.value?.id ?? null)
const feed = useGroupFeed(groupId, userId)
const toReview = computed(() => feed.items.value.filter((i) => i.uploader_id !== userId.value && !feed.myVotes.value.has(i.id)).length)

const filterKeys: Record<Filter, string> = { all: 'gallery.filterAll', toReview: 'gallery.filterToReview', mine: 'gallery.filterMine', reviewed: 'gallery.filterReviewed' }
const sortKeys: Record<Sort, string> = { newest: 'gallery.sortNewest', oldest: 'gallery.sortOldest', keep: 'gallery.sortKeep', letGo: 'gallery.sortLetGo', want: 'gallery.sortWant', title: 'gallery.sortTitle' }
const sortOpen = ref(false)

function matches(item: ClothingItem): boolean {
  const mine = item.uploader_id === userId.value
  switch (filter.value) {
    case 'toReview':
      return !mine && !feed.myVotes.value.has(item.id)
    case 'mine':
      return mine
    case 'reviewed':
      return !mine && feed.myVotes.value.has(item.id)
    default:
      return true
  }
}
function compare(a: ClothingItem, b: ClothingItem): number {
  const ca = feed.countsFor(a.id)
  const cb = feed.countsFor(b.id)
  switch (sort.value) {
    case 'oldest':
      return a.created_at.localeCompare(b.created_at)
    case 'keep':
      return cb.keep_count - ca.keep_count || b.created_at.localeCompare(a.created_at)
    case 'letGo':
      return cb.let_go_count - ca.let_go_count || b.created_at.localeCompare(a.created_at)
    case 'want':
      return cb.want_count - ca.want_count || b.created_at.localeCompare(a.created_at)
    case 'title':
      return (a.title || '￿').localeCompare(b.title || '￿', undefined, { sensitivity: 'base' }) || b.created_at.localeCompare(a.created_at)
    default:
      return b.created_at.localeCompare(a.created_at)
  }
}
const shown = computed(() => feed.items.value.filter(matches).sort(compare))
const filterCounts = computed(() => {
  const counts: Record<Filter, number> = { all: feed.items.value.length, toReview: 0, mine: 0, reviewed: 0 }
  for (const item of feed.items.value) {
    if (item.uploader_id === userId.value) counts.mine++
    else if (feed.myVotes.value.has(item.id)) counts.reviewed++
    else counts.toReview++
  }
  return counts
})

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
          <template v-else>
            <div class="mb-3 flex items-center gap-2">
              <div class="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto" role="group" :aria-label="t('gallery.filterAll')">
                <button
                  v-for="f in FILTERS"
                  :key="f"
                  type="button"
                  class="pill shrink-0 px-3 py-1.5 text-xs transition"
                  :class="filter === f ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200'"
                  :aria-pressed="filter === f"
                  @click="filter = f"
                >
                  {{ t(filterKeys[f]) }} <span class="opacity-70">{{ filterCounts[f] }}</span>
                </button>
              </div>
              <button type="button" class="btn-icon shrink-0 bg-white ring-1 ring-stone-200" :aria-label="t('gallery.sort')" :title="t('gallery.sort')" aria-haspopup="dialog" @click="sortOpen = true">
                <AppIcon name="sort" size="20" />
              </button>
            </div>
            <p v-if="!shown.length" class="py-8 text-center text-sm text-stone-500">{{ t('gallery.noMatch') }}</p>
            <div v-else class="grid grid-cols-3 gap-1.5">
              <PhotoTile
                v-for="item in shown"
                :key="item.id"
                :item="item"
                :counts="feed.countsFor(item.id)"
                :my-vote="feed.myVotes.value.get(item.id) ?? null"
                :is-mine="item.uploader_id === userId"
              />
            </div>
          </template>
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

    <BottomSheet :open="sortOpen" :title="t('gallery.sort')" @close="sortOpen = false">
      <ul class="list-group">
        <li v-for="s in SORTS" :key="s">
          <button type="button" class="list-row" :aria-current="sort === s ? 'true' : undefined" @click="sort = s; sortOpen = false">
            <span class="flex-1 font-medium">{{ t(sortKeys[s]) }}</span>
            <AppIcon v-if="sort === s" name="check" size="20" class="text-brand-600" />
          </button>
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
