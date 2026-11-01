import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, detectLocale, isSupportedLocale } from '@/i18n'
import fr from '@/i18n/locales/fr.json'
import en from '@/i18n/locales/en.json'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  )
}

describe('locale detection', () => {
  it('defaults to French', () => {
    expect(DEFAULT_LOCALE).toBe('fr')
    expect(detectLocale(null, [])).toBe('fr')
    expect(detectLocale(null, ['de-DE', 'es'])).toBe('fr')
  })

  it('uses the browser language only when supported', () => {
    expect(detectLocale(null, ['en-GB', 'fr'])).toBe('en')
    expect(detectLocale(null, ['de', 'en-US'])).toBe('en')
  })

  it('prefers the persisted choice', () => {
    expect(detectLocale('en', ['fr-FR'])).toBe('en')
    expect(detectLocale('xx', ['fr-FR'])).toBe('fr')
  })

  it('validates locale codes', () => {
    expect(isSupportedLocale('fr')).toBe(true)
    expect(isSupportedLocale('EN')).toBe(false)
  })
})

describe('translation resources', () => {
  it('have the same keys in French and English', () => {
    const frKeys = flatten(fr).sort()
    const enKeys = flatten(en).sort()
    expect(enKeys).toEqual(frKeys)
  })
})
