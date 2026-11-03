import { describe, expect, it, vi } from 'vitest'
import { isNetworkError, retryOnNetworkError } from '@/lib/retry'

describe('isNetworkError', () => {
  it('recognises browser fetch failures and Edge Function fetch errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkError({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toBe(true)
    expect(isNetworkError({ code: 'network_error' })).toBe(true)
  })

  it('leaves application errors alone', () => {
    expect(isNetworkError({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isNetworkError(new Error('photo_too_large'))).toBe(false)
    expect(isNetworkError(null)).toBe(false)
  })
})

describe('retryOnNetworkError', () => {
  it('retries a network failure and returns the later success', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce('ok')
    const sleep = vi.fn(async () => {})
    await expect(retryOnNetworkError(fn, { sleep })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(600)
  })

  it('gives up after the last attempt', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(retryOnNetworkError(fn, { attempts: 2, sleep: async () => {} })).rejects.toThrow('Failed to fetch')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue({ code: '42501', message: 'denied' })
    await expect(retryOnNetworkError(fn, { sleep: async () => {} })).rejects.toEqual({ code: '42501', message: 'denied' })
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
