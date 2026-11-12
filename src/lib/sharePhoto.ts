import { getPhotoBlob } from '@/composables/usePhotoUrl'

export type SharePhotoOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed'

function fileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return `${base || 'photo'}.jpg`
}

/**
 * Hand a photo to the native share sheet as a file (other apps, messages, mail). Where files
 * cannot be shared, the photo is saved instead. Never throws: the outcome drives the feedback.
 */
export async function sharePhoto(path: string, title: string): Promise<SharePhotoOutcome> {
  let file: File
  try {
    file = new File([await getPhotoBlob(path)], fileName(title), { type: 'image/jpeg' })
  } catch {
    return 'failed'
  }
  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: title || undefined })
      return 'shared'
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall through to saving the file.
    }
  }
  try {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
