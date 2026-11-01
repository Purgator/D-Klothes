// Small HTTP helpers shared by the Edge Functions.

const allowedOrigin = Deno.env.get('APP_ORIGIN') ?? '*'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extra },
  })
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export function fail(status: number, code: string, message?: string): never {
  throw new HttpError(status, code, message)
}

/** Wrap a handler: CORS preflight, JSON errors, no stack traces leaking to clients. */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.code, message: err.message }, err.status)
      }
      console.error('unhandled error', err instanceof Error ? err.message : String(err))
      return json({ error: 'internal_error' }, 500)
    }
  })
}

export async function readJson<T>(req: Request): Promise<T> {
  if (req.method !== 'POST') fail(405, 'method_not_allowed')
  try {
    return (await req.json()) as T
  } catch {
    fail(400, 'invalid_json')
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value)) fail(400, 'invalid_field', field)
  return value.toLowerCase()
}
