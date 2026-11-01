import { FunctionError } from '@/lib/supabase'

/** Map any thrown value to a translation key under `errors.*`. */
export function errorKey(err: unknown): string {
  if (err instanceof FunctionError) return `errors.${err.code}`
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: string; message?: string }
    switch (e.code) {
      case '42501':
        return 'errors.forbidden'
      case '23505':
        return 'errors.duplicate'
      case 'P0002':
        return 'errors.invalid_invitation'
      case 'P0003':
        return 'errors.already_reviewed'
      case 'P0004':
        return 'errors.not_a_member'
      case '23503':
        return 'errors.owns_groups'
    }
    if (e.message && /fetch|network/i.test(e.message)) return 'errors.network_error'
    if (e.message === 'photo_too_large') return 'errors.too_large'
    if (e.message === 'canvas_unsupported' || e.message === 'encode_failed') return 'errors.image_processing'
  }
  return 'errors.unknown'
}
