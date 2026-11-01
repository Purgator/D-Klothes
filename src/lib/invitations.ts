// Invitation link helpers. Tokens are 32 random bytes, base64url without padding (43 chars).

export const TOKEN_LENGTH = 43
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function isValidTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

export function buildInviteUrl(token: string, origin: string = window.location.origin, base: string = import.meta.env.BASE_URL): string {
  return `${origin}${base.replace(/\/$/, '')}/invite/${token}`
}

export function invitationState(inv: {
  expires_at: string
  revoked_at: string | null
  redeemed_at: string | null
}, now: Date = new Date()): 'active' | 'redeemed' | 'revoked' | 'expired' {
  if (inv.redeemed_at) return 'redeemed'
  if (inv.revoked_at) return 'revoked'
  if (new Date(inv.expires_at).getTime() <= now.getTime()) return 'expired'
  return 'active'
}
