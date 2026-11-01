// Trusted verification that an uploaded JPEG carries no metadata.
// The browser re-encodes photos through a canvas, which drops EXIF; this check
// makes the privacy promise hold even if a client skips that step.

export interface JpegInspection {
  isJpeg: boolean
  /** Marker names of metadata segments found (APP1 Exif, APP1 XMP, APP13 IPTC, COM...). */
  metadataSegments: string[]
}

export function inspectJpeg(bytes: Uint8Array): JpegInspection {
  const result: JpegInspection = { isJpeg: false, metadataSegments: [] }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return result
  result.isJpeg = true

  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]!
    // Padding bytes between markers.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    // Start of scan: entropy-coded data follows, metadata segments cannot appear after it
    // in any encoder output we accept.
    if (marker === 0xda || marker === 0xd9) break
    // Standalone markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) break
    const payload = bytes.subarray(offset + 4, offset + 2 + length)

    if (marker === 0xe1) {
      const head = asciiPrefix(payload, 29)
      if (head.startsWith('Exif\0')) result.metadataSegments.push('APP1:Exif')
      else if (head.startsWith('http://ns.adobe.com/xap/1.0/')) result.metadataSegments.push('APP1:XMP')
      else result.metadataSegments.push('APP1')
    } else if (marker === 0xe2) {
      // ICC colour profiles are not personal metadata; keep them.
      if (!asciiPrefix(payload, 11).startsWith('ICC_PROFILE')) result.metadataSegments.push('APP2')
    } else if (marker === 0xed) {
      result.metadataSegments.push('APP13:IPTC')
    } else if (marker === 0xfe) {
      result.metadataSegments.push('COM')
    } else if (marker >= 0xe3 && marker <= 0xef) {
      result.metadataSegments.push(`APP${marker - 0xe0}`)
    }
    // APP0 (JFIF) and APP14 (Adobe) only describe the encoding and are allowed.
    offset += 2 + length
  }
  return result
}

function asciiPrefix(bytes: Uint8Array, n: number): string {
  let s = ''
  for (let i = 0; i < Math.min(n, bytes.length); i++) s += String.fromCharCode(bytes[i]!)
  return s
}
