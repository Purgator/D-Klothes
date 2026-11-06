import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { voteCooldownRemaining } from '@/lib/votes'
import type { ClothingItem, Group, VoteType } from '@/types/database'

type GroupSummary = Pick<Group, 'id' | 'name' | 'owner_id' | 'members_can_upload'>

/**
 * What the review deck needs: the photos the caller may give advice on, either across every
 * group they belong to (`groupId` null) or in one group, with the caller's own votes and the
 * uploader and group names shown on the cards. RLS limits every query to the caller's groups;
 * Realtime only signals that something changed.
 */
export function useReviewQueue(groupId: Ref<string | null>, userId: Ref<string | null>) {
  const items = ref<ClothingItem[]>([])
  const myVotes = ref<Map<string, VoteType>>(new Map())
  const uploaderNames = ref<Map<string, string>>(new Map())
  const groups = ref<Map<string, GroupSummary>>(new Map())
  const loading = ref(true)
  const error = ref<string | null>(null)

  /** The selected group, when reviewing one. */
  const group = computed(() => (groupId.value ? (groups.value.get(groupId.value) ?? null) : null))
  const notMember = computed(() => !!groupId.value && !loading.value && !group.value)
  // Mirrors can_upload_to_group(): the server is the authority, this only drives the UI.
  const canUpload = computed(() => !!group.value && (group.value.members_can_upload || group.value.owner_id === userId.value))

  async function load() {
    error.value = null
    try {
      const itemsQuery = supabase.from('clothing_items').select('*').order('created_at', { ascending: true })
      const [i, v, p, g] = await Promise.all([
        groupId.value ? itemsQuery.eq('group_id', groupId.value) : itemsQuery,
        userId.value
          ? supabase.from('votes').select('item_id, vote').eq('voter_id', userId.value)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('profiles').select('id, display_name'),
        supabase.from('groups').select('id, name, owner_id, members_can_upload'),
      ])
      for (const r of [i, v, p, g]) if (r.error) throw r.error
      items.value = i.data ?? []
      const itemIds = new Set(items.value.map((it) => it.id))
      myVotes.value = new Map(
        ((v.data ?? []) as { item_id: string; vote: VoteType }[])
          .filter((row) => itemIds.has(row.item_id))
          .map((row) => [row.item_id, row.vote]),
      )
      uploaderNames.value = new Map((p.data ?? []).map((row) => [row.id, row.display_name]))
      groups.value = new Map((g.data ?? []).map((row) => [row.id, row]))
    } catch (err) {
      error.value = errorKey(err)
    } finally {
      loading.value = false
    }
  }

  let refetchTimer: ReturnType<typeof setTimeout> | undefined
  function scheduleRefetch() {
    clearTimeout(refetchTimer)
    refetchTimer = setTimeout(() => void load(), 250)
  }

  let channel: RealtimeChannel | null = null
  // Unique per instance: supabase-js refuses new callbacks on an already-subscribed topic.
  const instanceId = Math.random().toString(36).slice(2, 10)
  function subscribe() {
    unsubscribe()
    channel = supabase
      .channel(`review-queue:${groupId.value ?? 'all'}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_feed_state',
          ...(groupId.value ? { filter: `group_id=eq.${groupId.value}` } : {}),
        },
        scheduleRefetch,
      )
      .subscribe()
  }
  function unsubscribe() {
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
  }

  // When each item was last changed, so any further change waits a few seconds. Undo passes
  // `allowUndo` so a slip is still instant; what it undid cannot be redone before the cooldown ends.
  const votedAt = ref<Map<string, number>>(new Map())
  function cooldownFor(itemId: string): number {
    return voteCooldownRemaining(votedAt.value.get(itemId), Date.now())
  }

  async function vote(itemId: string, next: VoteType | null, { allowUndo = false } = {}): Promise<void> {
    const previous = myVotes.value.get(itemId) ?? null
    if (previous === next) return
    const isUndo = next === null && allowUndo
    if (!isUndo && cooldownFor(itemId) > 0) throw new Error('vote_cooldown')
    votedAt.value = new Map(votedAt.value).set(itemId, Date.now())
    // Optimistic update, then the authoritative refetch triggered by Realtime (or below).
    const updatedVotes = new Map(myVotes.value)
    if (next) updatedVotes.set(itemId, next)
    else updatedVotes.delete(itemId)
    myVotes.value = updatedVotes
    try {
      if (next) {
        const { error: rpcError } = await supabase.rpc('cast_vote', { p_item_id: itemId, p_vote: next })
        if (rpcError) throw rpcError
      } else if (userId.value) {
        const { error: delError } = await supabase.from('votes').delete().eq('item_id', itemId).eq('voter_id', userId.value)
        if (delError) throw delError
      }
    } finally {
      scheduleRefetch()
    }
  }

  watch(
    groupId,
    () => {
      loading.value = true
      void load()
      subscribe()
    },
    { immediate: true },
  )
  onUnmounted(() => {
    clearTimeout(refetchTimer)
    unsubscribe()
  })

  return { items, myVotes, uploaderNames, groups, group, loading, error, notMember, canUpload, load, vote, cooldownFor }
}
