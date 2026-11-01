// Photo retention helpers. The deadline stored in the database is the single source of truth.

export const RETENTION_NOTICE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export function daysUntil(deadline: string | Date, now: Date = new Date()): number {
  const target = typeof deadline === 'string' ? new Date(deadline) : deadline
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS)
}

/** True when the uploader should see the in-app deletion notice. */
export function isNoticeDue(deadline: string | Date, now: Date = new Date()): boolean {
  return daysUntil(deadline, now) <= RETENTION_NOTICE_DAYS
}

export function isExpired(deadline: string | Date, now: Date = new Date()): boolean {
  const target = typeof deadline === 'string' ? new Date(deadline) : deadline
  return target.getTime() <= now.getTime()
}
