import { describe, expect, it } from 'vitest'
import { buildInviteUrl, invitationState, isValidTokenFormat } from '@/lib/invitations'

const TOKEN = 'A'.repeat(43)

describe('invitation helpers', () => {
  it('accepts only 43-character base64url tokens', () => {
    expect(isValidTokenFormat(TOKEN)).toBe(true)
    expect(isValidTokenFormat('abc-_' + 'x'.repeat(38))).toBe(true)
    expect(isValidTokenFormat('A'.repeat(42))).toBe(false)
    expect(isValidTokenFormat('A'.repeat(44))).toBe(false)
    expect(isValidTokenFormat('A'.repeat(42) + '+')).toBe(false)
    expect(isValidTokenFormat('A'.repeat(42) + '=')).toBe(false)
    expect(isValidTokenFormat(null)).toBe(false)
    expect(isValidTokenFormat(42)).toBe(false)
  })

  it('builds the public invite URL', () => {
    expect(buildInviteUrl(TOKEN, 'https://dklothes.example')).toBe(`https://dklothes.example/invite/${TOKEN}`)
  })

  it('derives the lifecycle state', () => {
    const now = new Date('2026-11-01T12:00:00Z')
    const base = { expires_at: '2026-11-02T12:00:00Z', revoked_at: null, redeemed_at: null }
    expect(invitationState(base, now)).toBe('active')
    expect(invitationState({ ...base, expires_at: '2026-11-01T11:59:59Z' }, now)).toBe('expired')
    expect(invitationState({ ...base, revoked_at: '2026-11-01T10:00:00Z' }, now)).toBe('revoked')
    // Redeemed wins over everything else: a used link never becomes active again.
    expect(invitationState({ ...base, revoked_at: '2026-11-01T10:00:00Z', redeemed_at: '2026-11-01T09:00:00Z' }, now)).toBe('redeemed')
  })
})
