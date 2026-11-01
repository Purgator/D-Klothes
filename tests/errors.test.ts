import { describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

const { errorKey } = await import('@/lib/errors')
const { FunctionError } = await import('@/lib/supabase')

describe('errorKey', () => {
  it('maps Edge Function error codes', () => {
    expect(errorKey(new FunctionError('metadata_present', 422))).toBe('errors.metadata_present')
    expect(errorKey(new FunctionError('recent_login_required', 403))).toBe('errors.recent_login_required')
  })

  it('maps PostgREST / PL-pgSQL error codes', () => {
    expect(errorKey({ code: '42501', message: 'denied' })).toBe('errors.forbidden')
    expect(errorKey({ code: '23505', message: 'dup' })).toBe('errors.duplicate')
    expect(errorKey({ code: 'P0002', message: 'invalid invitation' })).toBe('errors.invalid_invitation')
    expect(errorKey({ code: 'P0003', message: 'reviewed' })).toBe('errors.already_reviewed')
  })

  it('falls back to a generic key', () => {
    expect(errorKey(new Error('boom'))).toBe('errors.unknown')
    expect(errorKey(undefined)).toBe('errors.unknown')
    expect(errorKey(new Error('Failed to fetch'))).toBe('errors.network_error')
  })
})
