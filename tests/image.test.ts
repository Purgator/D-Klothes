import { describe, expect, it } from 'vitest'
import { fitWithin, isAcceptedInput, MAX_PHOTO_BYTES, MAX_PHOTO_EDGE, QUALITY_STEPS } from '@/lib/image'

describe('image helpers', () => {
  it('caps the longest edge and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 })
    expect(MAX_PHOTO_EDGE).toBe(1600)
  })

  it('targets the 2 MiB limit with decreasing quality steps', () => {
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024)
    for (let i = 1; i < QUALITY_STEPS.length; i++) expect(QUALITY_STEPS[i]!).toBeLessThan(QUALITY_STEPS[i - 1]!)
  })

  it('accepts common photo formats and falls back on the extension', () => {
    expect(isAcceptedInput(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isAcceptedInput(new File([], 'a.HEIC', { type: '' }))).toBe(true)
    expect(isAcceptedInput(new File([], 'a.gif', { type: 'image/gif' }))).toBe(false)
    expect(isAcceptedInput(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})
