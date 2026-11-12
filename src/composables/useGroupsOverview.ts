import { computed, ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { errorKey } from '@/lib/errors'
import { onAppResume } from '@/lib/appResume'
import { useAuth } from '@/composables/useAuth'
import type { ClothingItem, Group, MyMembershipRequest } from '@/types/database'

export interface GroupOverview extends Group {
  memberCount: number
  photoCount: number
  /** Photos by others the caller has not given advice on yet. */
  toReview: number
  /** Membership requests waiting for the caller (owner only). */
  pendingRequests: number
}

// One shared snapshot for the review deck, the groups tab and the tab-bar badges.
const groups = ref<GroupOverview[]>([])
const requests = ref<MyMembershipRequest[]>([])
const notices = ref<ClothingItem[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
let inflight: Promise<void> | null = null

const CURRENT_GROUP_KEY = 'dklothes.group'
function readCurrentGroup(): string | null {
  try {
    return localStorage.getItem(CURRENT_GROUP_KEY)
  } catch {
    return null
  }
}
const storedGroupId = ref<string | null>(readCurrentGroup())

async function fetchOverview(userId: string): Promise<void> {
  error.value = null
  try {
    const [g, p, r, n, i, v] = await Promise.all([
      supabase.from('groups').select('*, group_members(count)').order('created_at'),
      // Pending applications to the groups I own (RLS limits this to my groups).
      supabase.from('membership_requests').select('group_id').eq('status', 'pending'),
      supabase.rpc('my_membership_requests'),
      supabase.rpc('my_retention_notices'),
      supabase.from('clothing_items').select('id, group_id, uploader_id'),
      supabase.from('votes').select('item_id').eq('voter_id', userId),
    ])
    for (const res of [g, p, r, n, i, v]) if (res.error) throw res.error

    const pendingByGroup = new Map<string, number>()
    for (const row of p.data ?? []) pendingByGroup.set(row.group_id, (pendingByGroup.get(row.group_id) ?? 0) + 1)
    const voted = new Set((v.data ?? []).map((row) => row.item_id))
    const photosByGroup = new Map<string, number>()
    const toReviewByGroup = new Map<string, number>()
    for (const item of i.data ?? []) {
      photosByGroup.set(item.group_id, (photosByGroup.get(item.group_id) ?? 0) + 1)
      if (item.uploader_id !== userId && !voted.has(item.id)) {
        toReviewByGroup.set(item.group_id, (toReviewByGroup.get(item.group_id) ?? 0) + 1)
      }
    }
    groups.value = ((g.data ?? []) as unknown as (Group & { group_members: { count: number }[] })[]).map((row) => ({
      ...row,
      memberCount: row.group_members?.[0]?.count ?? 0,
      photoCount: photosByGroup.get(row.id) ?? 0,
      toReview: toReviewByGroup.get(row.id) ?? 0,
      pendingRequests: row.owner_id === userId ? (pendingByGroup.get(row.id) ?? 0) : 0,
    }))
    requests.value = (r.data ?? []).filter((req) => req.status !== 'approved')
    notices.value = n.data ?? []
    loaded.value = true
  } catch (err) {
    error.value = errorKey(err)
  }
}

let watching = false

export function useGroupsOverview() {
  const auth = useAuth()

  async function load(): Promise<void> {
    const uid = auth.user.value?.id
    if (!uid) return
    if (inflight) return inflight
    loading.value = true
    inflight = fetchOverview(uid).finally(() => {
      loading.value = false
      inflight = null
    })
    return inflight
  }

  if (!watching) {
    watching = true
    onAppResume(() => void load())
    watch(
      () => (auth.hasProfile.value ? auth.user.value?.id : null),
      (uid) => {
        if (uid) void load()
        else {
          groups.value = []
          requests.value = []
          notices.value = []
          loaded.value = false
        }
      },
      { immediate: true },
    )
  }

  const toReviewTotal = computed(() => groups.value.reduce((sum, g) => sum + g.toReview, 0))
  const attentionTotal = computed(() => groups.value.reduce((sum, g) => sum + g.pendingRequests, 0) + notices.value.length)

  /**
   * The group the review deck is narrowed to, or null for every group at once (the default,
   * and the fallback when the remembered group is no longer available).
   */
  const currentGroup = computed<GroupOverview | null>(() => groups.value.find((g) => g.id === storedGroupId.value) ?? null)

  /** Narrow the deck to one group, or null to review every group. */
  function selectGroup(id: string | null) {
    storedGroupId.value = id
    try {
      if (id) localStorage.setItem(CURRENT_GROUP_KEY, id)
      else localStorage.removeItem(CURRENT_GROUP_KEY)
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  }

  /** Local adjustment after the caller gives advice, until the next refetch. */
  function noteReviewed(groupId: string, delta = -1) {
    groups.value = groups.value.map((g) => (g.id === groupId ? { ...g, toReview: Math.max(0, g.toReview + delta) } : g))
  }

  return { groups, requests, notices, loading, loaded, error, load, toReviewTotal, attentionTotal, currentGroup, selectGroup, noteReviewed }
}
