import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False when the build has no Supabase project configured; the UI then explains instead of failing. */
export const isConfigured = Boolean(url && anonKey)

// The anon key is public by design; every privilege comes from the user's session and RLS.
export const supabase = createClient<Database>(url || 'https://not-configured.invalid', anonKey || 'not-configured', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PHOTOS_BUCKET = 'photos'
/**
 * Photos never change once uploaded (unique path, no overwrite), so the browser may keep its
 * copy for a year: each device downloads a photo once. Sent as the object's Cache-Control.
 */
export const PHOTO_CACHE_SECONDS = 365 * 24 * 60 * 60

/** Absolute URL of an app route, honouring the deployment base path (e.g. GitHub Pages). */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  return `${window.location.origin}${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Invoke an Edge Function and surface its JSON error code when it fails. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.clone().json()) as { error?: string; message?: string; groups?: unknown }
        throw new FunctionError(payload.error ?? 'request_failed', ctx.status, payload)
      } catch (e) {
        if (e instanceof FunctionError) throw e
      }
      throw new FunctionError('request_failed', ctx.status)
    }
    throw new FunctionError('network_error', 0)
  }
  return data as T
}

export class FunctionError extends Error {
  constructor(
    public code: string,
    public status: number,
    public payload: Record<string, unknown> = {},
  ) {
    super(code)
  }
}
