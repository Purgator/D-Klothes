import type { VoteCounts, VoteType } from '@/types/database'

export const VOTE_TYPES: readonly VoteType[] = ['keep', 'let_go', 'want'] as const

export function emptyCounts(itemId: string): VoteCounts {
  return { item_id: itemId, keep_count: 0, let_go_count: 0, want_count: 0 }
}

export function indexCounts(rows: VoteCounts[]): Map<string, VoteCounts> {
  return new Map(rows.map((r) => [r.item_id, r]))
}

/**
 * Optimistically move the caller's vote from `previous` to `next` in a counts row,
 * so the UI reflects a vote change before the authoritative refetch arrives.
 */
export function applyVoteChange(counts: VoteCounts, previous: VoteType | null, next: VoteType | null): VoteCounts {
  const result = { ...counts }
  const key = (v: VoteType) => `${v}_count` as const
  if (previous) result[key(previous)] = Math.max(0, result[key(previous)] - 1)
  if (next) result[key(next)] = result[key(next)] + 1
  return result
}
