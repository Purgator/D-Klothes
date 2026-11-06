<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import AppIcon from '@/components/AppIcon.vue'
import BottomSheet from '@/components/BottomSheet.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'
import Illustration from '@/components/Illustration.vue'
import ShareButton from '@/components/ShareButton.vue'
import SwipeDeck from '@/components/SwipeDeck.vue'
import TopBar from '@/components/TopBar.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const overview = useGroupsOverview()
const baseUrl = import.meta.env.BASE_URL

const pickerOpen = ref(false)
// Null means the deck covers every group.
const group = computed(() => overview.currentGroup.value)
const hasGroups = computed(() => overview.groups.value.length > 0)

// `?group=` (older links, notifications) selects a group, then leaves the address clean.
watch(
  () => route.query.group,
  (g) => {
    if (typeof g === 'string' && g) {
      overview.selectGroup(g)
      void router.replace({ name: 'home' })
    }
  },
  { immediate: true },
)
onMounted(() => void overview.load())

function pick(id: string | null) {
  overview.selectGroup(id)
  pickerOpen.value = false
}
</script>

<template>
  <div class="screen-fixed">
    <TopBar>
      <template #leading>
        <img :src="`${baseUrl}icons/icon.svg`" alt="" width="32" height="32" class="ml-1 rounded-lg" />
      </template>
      <template #title>
        <button
          v-if="hasGroups"
          type="button"
          class="mx-auto flex max-w-full items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-base font-bold shadow-sm ring-1 ring-stone-900/5 active:scale-95"
          :aria-label="t('swipe.switchGroup')"
          aria-haspopup="dialog"
          @click="pickerOpen = true"
        >
          <span class="truncate">{{ group ? group.name : t('swipe.allGroups') }}</span>
          <AppIcon name="chevron-down" size="18" class="text-stone-500" />
        </button>
        <span v-else class="block text-center">{{ t('app.name') }}</span>
      </template>
      <template #trailing>
        <RouterLink v-if="group" :to="{ name: 'group', params: { groupId: group.id } }" class="btn-icon" :aria-label="t('group.photos')" :title="t('group.photos')">
          <AppIcon name="image" />
        </RouterLink>
      </template>
    </TopBar>

    <div class="screen-body flex min-h-0 flex-1 flex-col pb-2">
      <p v-if="overview.error.value" class="alert-error mb-2" role="alert">
        {{ t(overview.error.value) }} <button type="button" class="underline" @click="overview.load">{{ t('app.retry') }}</button>
      </p>

      <div v-if="!overview.loaded.value" class="min-h-0 flex-1 animate-pulse rounded-4xl bg-stone-200" role="status" :aria-label="t('app.loading')"></div>

      <!-- No group yet: the app starts here -->
      <div v-else-if="!hasGroups" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 text-center">
        <Illustration name="wardrobe" class="w-60 max-w-[65%]" />
        <div class="space-y-1">
          <h2 class="text-xl font-bold">{{ t('home.welcomeTitle') }}</h2>
          <p class="text-sm text-stone-600">{{ t('home.empty') }}</p>
        </div>
        <div class="flex flex-col items-stretch gap-2">
          <RouterLink :to="{ name: 'group-new' }" class="btn-primary"><AppIcon name="plus" size="20" /> {{ t('home.createGroup') }}</RouterLink>
          <ShareButton />
        </div>
      </div>

      <SwipeDeck v-else :key="group?.id ?? 'all'" :group-id="group?.id ?? null" @reviewed="overview.noteReviewed" />
    </div>

    <BottomSheet :open="pickerOpen" :title="t('swipe.switchGroup')" @close="pickerOpen = false">
      <ul class="list-group">
        <li>
          <button type="button" class="list-row" :aria-current="group ? undefined : 'true'" @click="pick(null)">
            <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"><AppIcon name="cards" size="20" /></span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ t('swipe.allGroups') }}</span>
              <span class="block text-xs text-stone-500">{{ t('swipe.allGroupsHint') }}</span>
            </span>
            <span v-if="overview.toReviewTotal.value" class="pill bg-brand-100 text-brand-800">{{ t('group.toReview', { count: overview.toReviewTotal.value }, overview.toReviewTotal.value) }}</span>
            <AppIcon v-if="!group" name="check" size="20" class="text-brand-600" />
          </button>
        </li>
        <li v-for="g in overview.groups.value" :key="g.id">
          <button type="button" class="list-row" :aria-current="g.id === group?.id ? 'true' : undefined" @click="pick(g.id)">
            <GroupAvatar :name="g.name" size="sm" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ g.name }}</span>
              <span class="block text-xs text-stone-500">{{ t('home.memberCount', { count: g.memberCount }, g.memberCount) }}</span>
            </span>
            <span v-if="g.toReview" class="pill bg-brand-100 text-brand-800">{{ t('group.toReview', { count: g.toReview }, g.toReview) }}</span>
            <AppIcon v-if="g.id === group?.id" name="check" size="20" class="text-brand-600" />
          </button>
        </li>
        <li>
          <RouterLink :to="{ name: 'group-new' }" class="list-row text-brand-700" @click="pickerOpen = false">
            <span class="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50"><AppIcon name="plus" size="20" /></span>
            <span class="font-medium">{{ t('home.createGroup') }}</span>
          </RouterLink>
        </li>
      </ul>
    </BottomSheet>
  </div>
</template>
