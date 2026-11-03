<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { useNotifications } from '@/composables/useNotifications'
import PageTitle from '@/components/PageTitle.vue'
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
      if (n.count > 1) return n.group_id ? { name: 'group-photos', params: { groupId: n.group_id } } : null
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
  <section>
    <PageTitle :title="t('notifications.title')" :back-to="{ name: 'home' }" :back-label="t('nav.home')">
      <template #actions>
        <button v-if="unread.length" type="button" class="btn-secondary" @click="notifications.markRead()">
          {{ t('notifications.markAllRead') }}
        </button>
      </template>
    </PageTitle>

    <p v-if="notifications.loading.value && !notifications.loaded.value" role="status" class="text-stone-500">{{ t('app.loading') }}</p>
    <p v-else-if="!notifications.items.value.length" class="card text-sm text-stone-600">{{ t('notifications.empty') }}</p>

    <template v-else>
      <section v-if="unread.length" class="mb-6" aria-labelledby="unread-title">
        <h2 id="unread-title" class="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">
          {{ t('notifications.unread', { count: unread.length }, unread.length) }}
        </h2>
        <ul class="flex flex-col gap-2">
          <li v-for="n in unread" :key="n.id">
            <component
              :is="target(n) ? 'RouterLink' : 'div'"
              :to="target(n) ?? undefined"
              class="card flex items-start gap-3 border-brand-100 bg-brand-50 hover:border-brand-600"
              @click="open(n)"
            >
              <span class="text-xl" aria-hidden="true">{{ icons[n.kind] }}</span>
              <span class="flex-1">
                <span class="block text-sm">{{ text(n) }}</span>
                <span class="block text-xs text-stone-500">{{ d(new Date(n.created_at), 'long') }}</span>
              </span>
            </component>
          </li>
        </ul>
      </section>

      <section v-if="read.length" aria-labelledby="history-title">
        <h2 id="history-title" class="mb-2 text-sm font-medium uppercase tracking-wide text-stone-500">{{ t('notifications.history') }}</h2>
        <ul class="flex flex-col gap-2">
          <li v-for="n in read" :key="n.id">
            <component :is="target(n) ? 'RouterLink' : 'div'" :to="target(n) ?? undefined" class="card flex items-start gap-3 text-stone-600 hover:border-stone-400">
              <span class="text-xl" aria-hidden="true">{{ icons[n.kind] }}</span>
              <span class="flex-1">
                <span class="block text-sm">{{ text(n) }}</span>
                <span class="block text-xs text-stone-400">{{ d(new Date(n.created_at), 'long') }}</span>
              </span>
            </component>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
