import { createI18n } from 'vue-i18n'
import fr from './locales/fr.json'
import en from './locales/en.json'

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'
const STORAGE_KEY = 'dklothes.locale'

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Persisted choice first; otherwise the browser language when supported; otherwise French.
 */
export function detectLocale(
  stored: string | null,
  browserLanguages: readonly string[],
): Locale {
  if (isSupportedLocale(stored)) return stored
  for (const lang of browserLanguages) {
    const short = lang.toLowerCase().split('-')[0]
    if (isSupportedLocale(short)) return short
  }
  return DEFAULT_LOCALE
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(readStored(), typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { fr, en },
  datetimeFormats: {
    fr: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    },
    en: {
      short: { year: 'numeric', month: 'short', day: 'numeric' },
      long: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
    },
  },
})

export function setLocale(locale: Locale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  try {
    localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // Storage may be unavailable (private mode); the choice then lasts for the session only.
  }
}

export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}
