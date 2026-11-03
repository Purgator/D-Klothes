import type { NotificationRow } from '@/types/database'

/** Several notification rows shown as one line. */
export interface NotificationGroup {
  /** Id of the newest row, used as the key. */
  id: string
  kind: NotificationRow['kind']
  rows: NotificationRow[]
  /** Distinct actor names, newest first. */
  actors: string[]
  /** Number of distinct items for item_added bursts, distinct actors for item_wanted. */
  count: number
  created_at: string
  unread: boolean
  group_id: string | null
  group_name: string | null
  item_id: string | null
  item_title: string | null
  request_id: string | null
}

/** Uploads by the same person in the same group within this window collapse into one line. */
export const BURST_WINDOW_MS = 60 * 60 * 1000

function keyFor(n: NotificationRow): string | null {
  if (n.kind === 'item_wanted' && n.item_id) return `wanted:${n.item_id}`
  if (n.kind === 'item_added' && n.group_id) return `added:${n.group_id}:${n.actor_name ?? ''}`
  return null
}

/**
 * Collapse rows newest-first: "I want this" per item, uploads per person per group within a
 * burst window. Read and unread rows are grouped separately so the list stays truthful.
 */
export function groupNotifications(rows: NotificationRow[]): NotificationGroup[] {
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const groups: NotificationGroup[] = []
  const open = new Map<string, NotificationGroup>()
  for (const n of sorted) {
    const key = keyFor(n)
    const bucket = key ? `${key}:${n.read_at ? 'read' : 'unread'}` : null
    const existing = bucket ? open.get(bucket) : undefined
    const newestInGroup = existing ? Date.parse(existing.rows[existing.rows.length - 1]!.created_at) : 0
    const withinWindow = existing && n.kind === 'item_added' ? newestInGroup - Date.parse(n.created_at) <= BURST_WINDOW_MS : true
    if (existing && withinWindow) {
      existing.rows.push(n)
      if (n.actor_name && !existing.actors.includes(n.actor_name)) existing.actors.push(n.actor_name)
      existing.count = n.kind === 'item_added' ? new Set(existing.rows.map((r) => r.item_id)).size : existing.actors.length
      continue
    }
    const group: NotificationGroup = {
      id: n.id,
      kind: n.kind,
      rows: [n],
      actors: n.actor_name ? [n.actor_name] : [],
      count: 1,
      created_at: n.created_at,
      unread: !n.read_at,
      group_id: n.group_id,
      group_name: n.group_name,
      item_id: n.item_id,
      item_title: n.item_title,
      request_id: n.request_id,
    }
    groups.push(group)
    if (bucket) open.set(bucket, group)
  }
  return groups
}
