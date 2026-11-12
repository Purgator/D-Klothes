import { describe, expect, it } from 'vitest'
import html from '../supabase/templates/magic_link.html?raw'
import { tokenHashFromFragment } from '@/lib/authLink'

describe('tokenHashFromFragment', () => {
  it('reads the token hash of a sign-in link', () => {
    expect(tokenHashFromFragment('#token_hash=pkce_0123456789abcdef0123&type=email')).toBe('pkce_0123456789abcdef0123')
    expect(tokenHashFromFragment('token_hash=0123456789abcdef0123&type=email')).toBe('0123456789abcdef0123')
  })

  it('ignores anything else', () => {
    expect(tokenHashFromFragment('')).toBeNull()
    expect(tokenHashFromFragment('#error=access_denied&error_description=expired')).toBeNull()
    expect(tokenHashFromFragment('#token_hash=0123456789abcdef0123')).toBeNull()
    expect(tokenHashFromFragment('#token_hash=0123456789abcdef0123&type=recovery')).toBeNull()
    expect(tokenHashFromFragment('#token_hash=short&type=email')).toBeNull()
    expect(tokenHashFromFragment('#token_hash=0123456789abcdef<script>&type=email')).toBeNull()
  })
})

describe('sign-in email template', () => {
  it('links to the app with the token hash in the fragment', () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] ?? '')
    const signIn = hrefs.filter((href) => href.includes('TokenHash'))
    expect(signIn.length).toBeGreaterThan(0)
    for (const href of signIn) expect(href).toBe('{{ .RedirectTo }}#token_hash={{ .TokenHash }}&amp;type=email')
    // No link goes through the backend's verify endpoint any more.
    expect(html).not.toContain('ConfirmationURL')
  })
})
