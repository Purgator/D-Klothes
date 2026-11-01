import { describe, expect, it } from 'vitest'
import { applyVoteChange, emptyCounts, indexCounts } from '@/lib/votes'

describe('vote helpers', () => {
  it('indexes counts by item id', () => {
    const map = indexCounts([
      { item_id: 'a', keep_count: 1, let_go_count: 2, want_count: 3 },
      { item_id: 'b', keep_count: 0, let_go_count: 0, want_count: 1 },
    ])
    expect(map.get('a')?.let_go_count).toBe(2)
    expect(map.get('b')?.want_count).toBe(1)
    expect(map.get('c')).toBeUndefined()
  })

  it('moves a single vote between types without going negative', () => {
    const start = { ...emptyCounts('x'), keep_count: 1 }
    const changed = applyVoteChange(start, 'keep', 'want')
    expect(changed).toEqual({ item_id: 'x', keep_count: 0, let_go_count: 0, want_count: 1 })
    const removed = applyVoteChange(changed, 'want', null)
    expect(removed.want_count).toBe(0)
    const underflow = applyVoteChange(emptyCounts('x'), 'let_go', null)
    expect(underflow.let_go_count).toBe(0)
  })

  it('adds a first vote', () => {
    expect(applyVoteChange(emptyCounts('x'), null, 'let_go').let_go_count).toBe(1)
  })
})
