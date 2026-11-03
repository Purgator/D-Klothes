/** True for errors raised when the request never reached the server (offline, DNS, aborted fetch). */
export function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { code?: string; status?: number; message?: string; name?: string }
  if (e.code === 'network_error') return true
  if (e.name === 'FunctionsFetchError') return true
  return typeof e.message === 'string' && /failed to fetch|load failed|networkerror|network request failed/i.test(e.message)
}

/**
 * Run `fn`, retrying it with a short backoff when it fails with a network error.
 * Only use it for operations that are safe to repeat.
 */
export async function retryOnNetworkError<T>(
  fn: () => Promise<T>,
  { attempts = 3, delayMs = 600, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (!isNetworkError(err) || attempt === attempts) throw err
      await sleep(delayMs * attempt)
    }
  }
  throw lastError
}
