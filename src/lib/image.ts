// Client-side photo preparation: re-encode through a canvas (which drops EXIF and every
// other metadata segment), downscale and compress until the result fits in 2 MiB.
// The server re-verifies size and metadata; this code is for user experience.

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
export const MAX_PHOTO_EDGE = 1600
export const ACCEPTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export interface PreparedPhoto {
  blob: Blob
  width: number
  height: number
}

/** Pick output dimensions so the longest edge is at most `maxEdge`. */
export function fitWithin(width: number, height: number, maxEdge = MAX_PHOTO_EDGE): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 }
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Quality steps tried in order until the JPEG fits the size limit. */
export const QUALITY_STEPS = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4] as const

export type PreparePhase = 'decoding' | 'compressing'

export async function preparePhoto(
  file: File,
  maxBytes = MAX_PHOTO_BYTES,
  onPhase: (phase: PreparePhase) => void = () => {},
): Promise<PreparedPhoto> {
  onPhase('decoding')
  // `from-image` applies the EXIF orientation before the metadata is discarded.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    onPhase('compressing')
    let edge = MAX_PHOTO_EDGE
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas_unsupported')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(bitmap, 0, 0, width, height)
      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToJpeg(canvas, quality)
        if (blob.size <= maxBytes) return { blob, width, height }
      }
      edge = Math.round(edge * 0.75)
    }
    throw new Error('photo_too_large')
  } finally {
    bitmap.close()
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))), 'image/jpeg', quality)
  })
}

export function isAcceptedInput(file: File): boolean {
  if (ACCEPTED_INPUT_TYPES.includes(file.type)) return true
  // Some browsers report an empty type for HEIC; fall back on the extension.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)
}
