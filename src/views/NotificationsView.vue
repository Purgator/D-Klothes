<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RouteLocationRaw } from 'vue-router'
import { useNotifications } from '@/composables/useNotifications'
import PageTitle from '@/components/PageTitle.vue'
import type { NotificationRow } from '@/types/database'

const { t, d } = useI18n()
const notifications = useNotifications()

onMounted(() => void notifications.load())

const unread = computed(() => notifications.items.value.filter((n) => !n.read_at))
const read = computed(() => notifications.items.value.filter((n) => n.read_at))

function target(n: NotificationRow): RouteLocationRaw | null {
  switch (n.kind) {
    case 'membership_requested':
      return n.group_id ? { name: 'group-settings', params: { groupId: n.group_id } } : null
    case 'request_approved':
    case 'member_joined':
      return n.group_id ? { name: 'group', params: { groupId: n.group_id } } : null
    case 'item_added':
    case 'item_wanted':
      return n.group_id && n.item_id ? { name: 'item', params: { groupId: n.group_id, itemId: n.item_id } } : null
    default:
      return null
  }
}

function text(n: NotificationRow): string {
  return t(`notifications.kind.${n.kind}`, {
    actor: n.actor_name ?? t('notifications.someone'),
    group: n.group_name ?? t('notifications.aGroup'),
    item: n.item_title || t('home.untitled'),
  })
}

const icons: Record<NotificationRow['kind'], string> = {
  membership_requested: '🙋',
  request_approved: '✅',
  request_rejected: '🚫',
  member_joined: '👋',
  item_added: '📷',
  item_wanted: '💛',
}

async function open(n: NotificationRow) {
  if (!n.read_at) await notifications.markRead([n.id])
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
