import { describe, expect, it } from 'vitest'
import { inspectJpeg } from '../supabase/functions/_shared/jpeg'

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload]
}
const SOI = [0xff, 0xd8]
const JFIF = segment(0xe0, [...'JFIF\0'].map((c) => c.charCodeAt(0)), )
const SOS = [0xff, 0xda, 0x00, 0x02]
const EXIF = segment(0xe1, [...'Exif\0\0'].map((c) => c.charCodeAt(0)), )
const XMP = segment(0xe1, [...'http://ns.adobe.com/xap/1.0/\0'].map((c) => c.charCodeAt(0)))
const ICC = segment(0xe2, [...'ICC_PROFILE\0'].map((c) => c.charCodeAt(0)))
const IPTC = segment(0xed, [1, 2, 3])
const COMMENT = segment(0xfe, [...'hi'].map((c) => c.charCodeAt(0)))

describe('inspectJpeg', () => {
  it('rejects non-JPEG data', () => {
    expect(inspectJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).isJpeg).toBe(false)
    expect(inspectJpeg(new Uint8Array([])).isJpeg).toBe(false)
  })

  it('accepts a clean canvas-style JPEG (JFIF + ICC only)', () => {
    const r = inspectJpeg(new Uint8Array([...SOI, ...JFIF, ...ICC, ...SOS, 1, 2, 3]))
    expect(r.isJpeg).toBe(true)
    expect(r.metadataSegments).toEqual([])
  })

  it('flags EXIF, XMP, IPTC and comment segments', () => {
    expect(inspectJpeg(new Uint8Array([...SOI, ...JFIF, ...EXIF, ...SOS])).metadataSegments).toEqual(['APP1:Exif'])
    expect(inspectJpeg(new Uint8Array([...SOI, ...XMP, ...SOS])).metadataSegments).toEqual(['APP1:XMP'])
    expect(inspectJpeg(new Uint8Array([...SOI, ...IPTC, ...COMMENT, ...SOS])).metadataSegments).toEqual(['APP13:IPTC', 'COM'])
  })

  it('stops scanning at a truncated segment instead of throwing', () => {
    const truncated = new Uint8Array([...SOI, 0xff, 0xe1, 0xff, 0xff, 0x00])
    expect(() => inspectJpeg(truncated)).not.toThrow()
  })
})
