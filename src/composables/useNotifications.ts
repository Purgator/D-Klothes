import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/composables/useAuth'
import { groupNotifications } from '@/lib/notifications'
import type { NotificationRow } from '@/types/database'

// Shared notification state (one list, one subscription) for the whole app.
const items = ref<NotificationRow[]>([])
const loading = ref(false)
const loaded = ref(false)
let channel: RealtimeChannel | null = null
let watching = false
let refetchTimer: ReturnType<typeof setTimeout> | undefined

async function load() {
  loading.value = true
  try {
    const { data, error } = await supabase.rpc('my_notifications', { p_limit: 100 })
    if (!error) {
      items.value = data ?? []
      loaded.value = true
    }
  } finally {
    loading.value = false
  }
}

function scheduleLoad() {
  clearTimeout(refetchTimer)
  refetchTimer = setTimeout(() => void load(), 300)
}

function subscribe(userId: string) {
  unsubscribe()
  channel = supabase
    .channel(`notifications:${userId}:${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, scheduleLoad)
    .subscribe()
}

function unsubscribe() {
  if (channel) {
    void supabase.removeChannel(channel)
    channel = null
  }
}

export function useNotifications() {
  const auth = useAuth()

  if (!watching) {
    watching = true
    watch(
      () => (auth.hasProfile.value ? auth.user.value?.id : null),
      (uid) => {
        if (uid) {
          void load()
          subscribe(uid)
        } else {
          unsubscribe()
          items.value = []
          loaded.value = false
        }
      },
      { immediate: true },
    )
  }

  const groups = computed(() => groupNotifications(items.value))
  const unreadCount = computed(() => groups.value.filter((g) => g.unread).length)

  async function markRead(ids?: string[]) {
    const now = new Date().toISOString()
    items.value = items.value.map((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n))
    await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {})
    scheduleLoad()
  }

  return { items, groups, unreadCount, loading, loaded, load, markRead }
}
