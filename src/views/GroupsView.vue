<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { daysUntil } from '@/lib/retention'
import AppIcon from '@/components/AppIcon.vue'
import GroupAvatar from '@/components/GroupAvatar.vue'
import Illustration from '@/components/Illustration.vue'
import TopBar from '@/components/TopBar.vue'

const { t, d } = useI18n()
const auth = useAuth()
const overview = useGroupsOverview()
onMounted(() => void overview.load())
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('nav.groups')">
      <template #trailing>
        <RouterLink :to="{ name: 'group-new' }" class="btn-icon" :aria-label="t('home.createGroup')" :title="t('home.createGroup')">
          <AppIcon name="plus" />
        </RouterLink>
      </template>
    </TopBar>

    <div class="screen-body pb-8">
      <p v-if="overview.error.value" class="alert-error mb-4" role="alert">
        {{ t(overview.error.value) }} <button type="button" class="underline" @click="overview.load">{{ t('app.retry') }}</button>
      </p>

      <div v-if="!overview.loaded.value" class="flex flex-col gap-3" role="status" :aria-label="t('app.loading')">
        <div v-for="n in 3" :key="n" class="h-20 animate-pulse rounded-3xl bg-stone-200"></div>
      </div>

      <template v-else>
        <section v-if="overview.notices.value.length" class="alert-warning mb-4" aria-labelledby="retention-title">
          <h2 id="retention-title" class="flex items-center gap-2 font-semibold"><AppIcon name="clock" size="18" /> {{ t('home.retentionTitle') }}</h2>
          <p class="mb-2 mt-1">{{ t('home.retentionBody') }}</p>
          <ul class="flex flex-col gap-1">
            <li v-for="item in overview.notices.value" :key="item.id">
              <RouterLink :to="{ name: 'item', params: { groupId: item.group_id, itemId: item.id } }" class="underline">
                {{
                  t(
                    'home.retentionItem',
                    { title: item.title || t('home.untitled'), date: d(new Date(item.retention_deadline), 'short'), days: Math.max(0, daysUntil(item.retention_deadline)) },
                    Math.max(0, daysUntil(item.retention_deadline)),
                  )
                }}
              </RouterLink>
            </li>
          </ul>
        </section>

        <section v-if="overview.requests.value.length" class="mb-4" aria-labelledby="requests-title">
          <h2 id="requests-title" class="section-title mt-0">{{ t('home.pendingRequests') }}</h2>
          <ul class="list-group">
            <li v-for="req in overview.requests.value" :key="req.id" class="list-row text-sm" :class="req.status === 'rejected' ? 'text-stone-500' : ''">
              <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" :class="req.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'">
                <AppIcon :name="req.status === 'pending' ? 'clock' : 'x'" size="18" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block">{{ req.status === 'pending' ? t('home.pendingRequestHint', { group: req.group_name }) : t('home.rejectedRequest', { group: req.group_name }) }}</span>
                <span class="block text-xs text-stone-400">{{ d(new Date(req.created_at), 'short') }}</span>
              </span>
            </li>
          </ul>
        </section>

        <div v-if="!overview.groups.value.length" class="flex flex-col items-center gap-4 py-10 text-center">
          <Illustration name="wardrobe" class="w-56 max-w-[60%]" />
          <p class="text-sm text-stone-600">{{ t('home.empty') }}</p>
          <RouterLink :to="{ name: 'group-new' }" class="btn-primary"><AppIcon name="plus" size="20" /> {{ t('home.createGroup') }}</RouterLink>
        </div>

        <ul v-else class="list-group">
          <li v-for="group in overview.groups.value" :key="group.id">
            <RouterLink :to="{ name: 'group', params: { groupId: group.id } }" class="list-row py-3.5 hover:bg-stone-50">
              <GroupAvatar :name="group.name" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-1.5">
                  <span class="truncate font-semibold">{{ group.name }}</span>
                  <AppIcon v-if="group.owner_id === auth.user.value?.id" name="crown" size="16" class="text-amber-500" :title="t('home.ownerBadge')" />
                </span>
                <span class="block text-xs text-stone-500">
                  {{ t('home.memberCount', { count: group.memberCount }, group.memberCount) }} ·
                  {{ t('group.photoCount', { count: group.photoCount }, group.photoCount) }}
                </span>
                <span v-if="group.toReview || group.pendingRequests" class="mt-1 flex flex-wrap gap-1">
                  <span v-if="group.toReview" class="pill bg-brand-100 text-brand-800">{{ t('group.toReview', { count: group.toReview }, group.toReview) }}</span>
                  <span v-if="group.pendingRequests" class="pill bg-amber-100 text-amber-900">{{ t('group.pendingRequests', { count: group.pendingRequests }, group.pendingRequests) }}</span>
                </span>
              </span>
              <AppIcon name="chevron-right" size="20" class="text-stone-400" />
            </RouterLink>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
