import { appUrl } from '@/lib/supabase'

export type ShareOutcome = 'shared' | 'copied' | 'unsupported' | 'cancelled'

/** Public address of the welcome page, honouring the deployment base path. */
export function welcomeUrl(): string {
  return appUrl('/welcome')
}

/**
 * Share a link with the native share sheet when available, otherwise copy it.
 * Never throws: the outcome tells the caller what feedback to show.
 */
export async function shareLink(data: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall through to the clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(data.url)
    return 'copied'
  } catch {
    return 'unsupported'
  }
}
