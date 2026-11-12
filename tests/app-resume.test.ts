import { afterEach, describe, expect, it, vi } from 'vitest'
import { RESUME_AFTER_HIDDEN_MS, isResume, onAppResume } from '@/lib/appResume'

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('isResume', () => {
  it('needs a real absence', () => {
    expect(isResume(null, 5_000)).toBe(false)
    expect(isResume(1_000, 1_000 + RESUME_AFTER_HIDDEN_MS - 1)).toBe(false)
    expect(isResume(1_000, 1_000 + RESUME_AFTER_HIDDEN_MS)).toBe(true)
  })
})

describe('onAppResume', () => {
  afterEach(() => vi.useRealTimers())

  it('fires after a long time in the background, not after a glance elsewhere', () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    const stop = onAppResume(listener)

    setVisibility('hidden')
    vi.advanceTimersByTime(5_000)
    setVisibility('visible')
    expect(listener).not.toHaveBeenCalled()

    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_AFTER_HIDDEN_MS)
    setVisibility('visible')
    expect(listener).toHaveBeenCalledTimes(1)

    stop()
    setVisibility('hidden')
    vi.advanceTimersByTime(RESUME_AFTER_HIDDEN_MS)
    setVisibility('visible')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
