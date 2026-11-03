import { describe, expect, it } from 'vitest'
import { groupNotifications } from '@/lib/notifications'
import type { NotificationRow } from '@/types/database'

function row(partial: Partial<NotificationRow> & { id: string; kind: NotificationRow['kind']; created_at: string }): NotificationRow {
  return {
    read_at: null,
    group_id: 'g1',
    group_name: 'Group',
    item_id: null,
    item_title: null,
    request_id: null,
    actor_name: 'Camille',
    ...partial,
  } as NotificationRow
}

describe('groupNotifications', () => {
  it('collapses "I want this" per item and counts distinct people', () => {
    const groups = groupNotifications([
      row({ id: 'a', kind: 'item_wanted', item_id: 'i1', item_title: 'Jacket', created_at: '2026-11-03T10:00:00Z', actor_name: 'Camille' }),
      row({ id: 'b', kind: 'item_wanted', item_id: 'i1', item_title: 'Jacket', created_at: '2026-11-03T11:00:00Z', actor_name: 'Sam' }),
      row({ id: 'c', kind: 'item_wanted', item_id: 'i2', item_title: 'Hat', created_at: '2026-11-03T12:00:00Z', actor_name: 'Sam' }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['c', 'b'])
    expect(groups[1]!.actors).toEqual(['Sam', 'Camille'])
    expect(groups[1]!.count).toBe(2)
    expect(groups[1]!.rows).toHaveLength(2)
  })

  it('collapses an upload burst by the same person, but not uploads hours apart', () => {
    const groups = groupNotifications([
      row({ id: 'a', kind: 'item_added', item_id: 'i1', created_at: '2026-11-03T10:00:00Z' }),
      row({ id: 'b', kind: 'item_added', item_id: 'i2', created_at: '2026-11-03T10:10:00Z' }),
      row({ id: 'c', kind: 'item_added', item_id: 'i3', created_at: '2026-11-03T10:20:00Z' }),
      row({ id: 'd', kind: 'item_added', item_id: 'i4', created_at: '2026-11-03T15:00:00Z' }),
      row({ id: 'e', kind: 'item_added', item_id: 'i5', created_at: '2026-11-03T15:05:00Z', actor_name: 'Sam' }),
    ])
    expect(groups.map((g) => [g.id, g.count])).toEqual([
      ['e', 1],
      ['d', 1],
      ['c', 3],
    ])
  })

  it('keeps read and unread rows apart and leaves other kinds alone', () => {
    const groups = groupNotifications([
      row({ id: 'a', kind: 'item_wanted', item_id: 'i1', created_at: '2026-11-03T10:00:00Z', read_at: '2026-11-03T10:30:00Z' }),
      row({ id: 'b', kind: 'item_wanted', item_id: 'i1', created_at: '2026-11-03T11:00:00Z', actor_name: 'Sam' }),
      row({ id: 'c', kind: 'member_joined', created_at: '2026-11-03T12:00:00Z' }),
      row({ id: 'd', kind: 'member_joined', created_at: '2026-11-03T13:00:00Z' }),
    ])
    expect(groups.map((g) => [g.id, g.unread])).toEqual([
      ['d', true],
      ['c', true],
      ['b', true],
      ['a', false],
    ])
  })
})
