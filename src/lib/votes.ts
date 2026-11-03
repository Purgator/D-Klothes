import type { VoteCounts, VoteType } from '@/types/database'

export const VOTE_TYPES: readonly VoteType[] = ['keep', 'let_go', 'want'] as const

export const VOTE_EMOJI: Record<VoteType, string> = { keep: '👍', let_go: '👋', want: '😍' }

/** How long a member waits before changing an advice they just gave (frontend only). */
export const VOTE_COOLDOWN_MS = 5000

/** Milliseconds left before the advice on an item can be changed again (0 when free). */
export function voteCooldownRemaining(lastVotedAt: number | undefined, now: number, cooldownMs = VOTE_COOLDOWN_MS): number {
  if (lastVotedAt === undefined) return 0
  return Math.max(0, lastVotedAt + cooldownMs - now)
}

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
