import { computed, onUnmounted, ref, watch, type Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { applyVoteChange, emptyCounts, indexCounts } from '@/lib/votes'
import { errorKey } from '@/lib/errors'
import { VOTE_COOLDOWN_MS, voteCooldownRemaining } from '@/lib/votes'
import type { ClothingItem, Group, GroupMember, Profile, VoteCounts, VoteType } from '@/types/database'

export interface MemberWithProfile extends GroupMember {
  profile: Pick<Profile, 'id' | 'display_name'> | null
}

/**
 * Loads a group, its roster, items, aggregate vote counts and the caller's own votes.
 * Realtime only signals that something changed; data always comes from authorized queries.
 */
export function useGroupFeed(groupId: Ref<string>, userId: Ref<string | null>) {
  const group = ref<Group | null>(null)
  const members = ref<MemberWithProfile[]>([])
  const items = ref<ClothingItem[]>([])
  const counts = ref<Map<string, VoteCounts>>(new Map())
  const myVotes = ref<Map<string, VoteType>>(new Map())
  const loading = ref(true)
  const error = ref<string | null>(null)
  const notMember = ref(false)
  const live = ref(false)

  const isOwner = computed(() => !!group.value && group.value.owner_id === userId.value)
  // Mirrors can_upload_to_group(): the server is the authority, this only drives the UI.
  const canUpload = computed(() => !!group.value && (group.value.members_can_upload || isOwner.value))
  const memberNames = computed(() => new Map(members.value.map((m) => [m.user_id, m.profile?.display_name ?? '?'])))

  async function load() {
    error.value = null
    try {
      const [g, m, i, c, v] = await Promise.all([
        supabase.from('groups').select('*').eq('id', groupId.value).maybeSingle(),
        supabase.from('group_members').select('*, profile:profiles(id, display_name)').eq('group_id', groupId.value),
        supabase.from('clothing_items').select('*').eq('group_id', groupId.value).order('created_at', { ascending: false }),
        supabase.rpc('group_vote_counts', { p_group_id: groupId.value }),
        userId.value
          ? supabase.from('votes').select('item_id, vote').eq('voter_id', userId.value)
          : Promise.resolve({ data: [], error: null }),
      ])
      for (const r of [g, m, i, c, v]) if (r.error) throw r.error
      if (!g.data) {
        notMember.value = true
        group.value = null
        return
      }
      notMember.value = false
      group.value = g.data
      members.value = (m.data ?? []) as unknown as MemberWithProfile[]
      items.value = i.data ?? []
      counts.value = indexCounts(c.data ?? [])
      const itemIds = new Set(items.value.map((it) => it.id))
      myVotes.value = new Map(
        ((v.data ?? []) as { item_id: string; vote: VoteType }[])
          .filter((row) => itemIds.has(row.item_id))
          .map((row) => [row.item_id, row.vote]),
      )
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
  // Unique per composable instance: two views of the same group (feed, item, settings) can
  // overlap during navigation, and supabase-js refuses new callbacks on an already-subscribed topic.
  const instanceId = Math.random().toString(36).slice(2, 10)
  function subscribe() {
    unsubscribe()
    channel = supabase
      .channel(`group-feed:${groupId.value}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_feed_state', filter: `group_id=eq.${groupId.value}` },
        scheduleRefetch,
      )
      .subscribe((status) => {
        live.value = status === 'SUBSCRIBED'
      })
  }
  function unsubscribe() {
    if (channel) {
      void supabase.removeChannel(channel)
      channel = null
    }
    live.value = false
  }

  function countsFor(itemId: string): VoteCounts {
    return counts.value.get(itemId) ?? emptyCounts(itemId)
  }

  // When each item was last changed, so any further change (set, switch or remove) waits a
  // few seconds. The swipe page's undo passes `allowUndo` so a slip is still instant; what it
  // undid cannot be redone before the cooldown ends.
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
    const updatedCounts = new Map(counts.value)
    updatedCounts.set(itemId, applyVoteChange(countsFor(itemId), previous, next))
    counts.value = updatedCounts
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

  return { group, members, items, counts, myVotes, loading, error, notMember, live, isOwner, canUpload, memberNames, load, countsFor, vote, cooldownFor, VOTE_COOLDOWN_MS }
}
