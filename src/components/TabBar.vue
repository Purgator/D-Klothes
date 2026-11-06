<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import AppIcon, { type IconName } from '@/components/AppIcon.vue'
import { useNotifications } from '@/composables/useNotifications'
import { useGroupsOverview } from '@/composables/useGroupsOverview'
import { atAppRoot } from '@/lib/appNavigation'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// Tabs replace each other (back never walks through tabs), except from the guard entry,
// which must stay underneath so the exit warning keeps working.
function open(name: string) {
  if (route.name === name) return
  void (atAppRoot() ? router.push({ name }) : router.replace({ name }))
}
const notifications = useNotifications()
const overview = useGroupsOverview()

const tabs = computed<{ name: string; icon: IconName; label: string; badge: number }[]>(() => [
  { name: 'home', icon: 'cards', label: t('nav.review'), badge: overview.toReviewTotal.value },
  { name: 'groups', icon: 'users', label: t('nav.groups'), badge: overview.attentionTotal.value },
  { name: 'notifications', icon: 'bell', label: t('nav.notifications'), badge: notifications.unreadCount.value },
  { name: 'account', icon: 'user', label: t('nav.account'), badge: 0 },
])
</script>

<template>
  <nav class="shrink-0 bg-white/95 pb-safe shadow-bar backdrop-blur" :aria-label="t('app.name')">
    <ul class="mx-auto grid max-w-lg grid-cols-4">
      <li v-for="tab in tabs" :key="tab.name">
        <RouterLink v-slot="{ href }" :to="{ name: tab.name }" custom>
          <a
            :href="href"
            class="flex flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-medium transition"
            :class="route.name === tab.name ? 'text-brand-700' : 'text-stone-500 hover:text-stone-700'"
            :aria-current="route.name === tab.name ? 'page' : undefined"
            @click.prevent="open(tab.name)"
          >
          <span class="relative rounded-2xl px-4 py-1 transition" :class="route.name === tab.name ? 'bg-brand-100' : ''">
            <AppIcon :name="tab.icon" :stroke-width="route.name === tab.name ? 2.4 : 2" />
            <span v-if="tab.badge" class="badge absolute -right-1 -top-1" aria-hidden="true">{{ tab.badge > 99 ? '99+' : tab.badge }}</span>
          </span>
            <span>{{ tab.label }}</span>
            <span v-if="tab.badge" class="sr-only">({{ tab.badge }})</span>
          </a>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
