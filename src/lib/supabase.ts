import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see .env.example)')
}

// The anon key is public by design; every privilege comes from the user's session and RLS.
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PHOTOS_BUCKET = 'photos'
export const SIGNED_URL_TTL_SECONDS = 600

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
