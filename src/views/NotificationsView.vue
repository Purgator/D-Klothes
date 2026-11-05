<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { useNotifications } from '@/composables/useNotifications'
import AppIcon from '@/components/AppIcon.vue'
import Illustration from '@/components/Illustration.vue'
import TopBar from '@/components/TopBar.vue'
import type { NotificationGroup } from '@/lib/notifications'
import type { NotificationRow } from '@/types/database'

const { t, d } = useI18n()
const notifications = useNotifications()

onMounted(() => void notifications.load())

const unread = computed(() => notifications.groups.value.filter((g) => g.unread))
const read = computed(() => notifications.groups.value.filter((g) => !g.unread))

function target(n: NotificationGroup): RouteLocationRaw | null {
  switch (n.kind) {
    case 'membership_requested':
      return n.group_id ? { name: 'group-settings', params: { groupId: n.group_id } } : null
    case 'request_approved':
    case 'member_joined':
      return n.group_id ? { name: 'group', params: { groupId: n.group_id } } : null
    case 'item_added':
      if (n.count > 1) return n.group_id ? { name: 'group', params: { groupId: n.group_id } } : null
      return n.group_id && n.item_id ? { name: 'item', params: { groupId: n.group_id, itemId: n.item_id } } : null
    case 'item_wanted':
      return n.group_id && n.item_id ? { name: 'item', params: { groupId: n.group_id, itemId: n.item_id } } : null
    default:
      return null
  }
}

function text(n: NotificationGroup): string {
  const params = {
    actor: n.actors[0] ?? t('notifications.someone'),
    others: n.actors.length - 1,
    count: n.count,
    group: n.group_name ?? t('notifications.aGroup'),
    item: n.item_title || t('home.untitled'),
  }
  if (n.kind === 'item_wanted' && n.actors.length > 1) return t('notifications.many.item_wanted', params, n.actors.length - 1)
  if (n.kind === 'item_added' && n.count > 1) return t('notifications.many.item_added', params, n.count)
  return t(`notifications.kind.${n.kind}`, params)
}

const icons: Record<NotificationRow['kind'], string> = {
  membership_requested: '🙋',
  request_approved: '✅',
  request_rejected: '🚫',
  member_joined: '👋',
  item_added: '📷',
  item_wanted: '💛',
}

async function open(n: NotificationGroup) {
  if (n.unread) await notifications.markRead(n.rows.map((r) => r.id))
}
</script>

<template>
  <div class="screen-scroll">
    <TopBar :title="t('notifications.title')">
      <template #trailing>
        <button v-if="unread.length" type="button" class="btn-ghost btn-sm" @click="notifications.markRead()">
          <AppIcon name="check" size="16" /> {{ t('notifications.markAllRead') }}
        </button>
      </template>
    </TopBar>

    <div class="screen-body pb-8">
      <div v-if="notifications.loading.value && !notifications.loaded.value" class="flex flex-col gap-2" role="status" :aria-label="t('app.loading')">
        <div v-for="n in 4" :key="n" class="h-16 animate-pulse rounded-3xl bg-stone-200"></div>
      </div>
      <div v-else-if="!notifications.items.value.length" class="flex flex-col items-center gap-4 py-10 text-center">
        <Illustration name="inbox" class="w-52 max-w-[55%]" />
        <p class="text-lg font-bold">{{ t('notifications.emptyTitle') }}</p>
        <p class="text-sm text-stone-600">{{ t('notifications.empty') }}</p>
      </div>

      <template v-else>
        <section v-if="unread.length" aria-labelledby="unread-title">
          <h2 id="unread-title" class="section-title mt-2">{{ t('notifications.unread', { count: unread.length }, unread.length) }}</h2>
          <ul class="list-group">
            <li v-for="n in unread" :key="n.id">
              <component :is="target(n) ? 'RouterLink' : 'div'" :to="target(n) ?? undefined" class="list-row bg-brand-50/60 hover:bg-brand-50" @click="open(n)">
                <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm" aria-hidden="true">{{ icons[n.kind] }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium">{{ text(n) }}</span>
                  <span class="block text-xs text-stone-500">{{ d(new Date(n.created_at), 'long') }}</span>
                </span>
                <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" aria-hidden="true"></span>
              </component>
            </li>
          </ul>
        </section>

        <section v-if="read.length" aria-labelledby="history-title">
          <h2 id="history-title" class="section-title" :class="unread.length ? '' : 'mt-2'">{{ t('notifications.history') }}</h2>
          <ul class="list-group">
            <li v-for="n in read" :key="n.id">
              <component :is="target(n) ? 'RouterLink' : 'div'" :to="target(n) ?? undefined" class="list-row text-stone-600 hover:bg-stone-50">
                <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xl" aria-hidden="true">{{ icons[n.kind] }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm">{{ text(n) }}</span>
                  <span class="block text-xs text-stone-400">{{ d(new Date(n.created_at), 'long') }}</span>
                </span>
                <AppIcon v-if="target(n)" name="chevron-right" size="18" class="text-stone-300" />
              </component>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
