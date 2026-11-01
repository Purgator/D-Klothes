import { describe, expect, it } from 'vitest'
import { daysUntil, isExpired, isNoticeDue, RETENTION_NOTICE_DAYS } from '@/lib/retention'

describe('retention helpers', () => {
  const now = new Date('2026-11-01T00:00:00Z')

  it('counts whole days until the deadline', () => {
    expect(daysUntil('2026-11-11T00:00:00Z', now)).toBe(10)
    expect(daysUntil('2026-11-01T12:00:00Z', now)).toBe(1)
    expect(daysUntil('2026-10-31T00:00:00Z', now)).toBe(-1)
  })

  it('shows the notice only inside the 30-day window', () => {
    expect(RETENTION_NOTICE_DAYS).toBe(30)
    expect(isNoticeDue('2026-12-01T00:00:00Z', now)).toBe(true)
    expect(isNoticeDue('2026-12-02T00:00:00Z', now)).toBe(false)
    expect(isNoticeDue('2028-11-01T00:00:00Z', now)).toBe(false)
  })

  it('detects expiry', () => {
    expect(isExpired('2026-11-01T00:00:00Z', now)).toBe(true)
    expect(isExpired('2026-11-01T00:00:01Z', now)).toBe(false)
  })
})
