import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { fail } from './http.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

/** Client acting as the signed-in user (RLS applies). */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? ''
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Privileged client. Only ever used inside Edge Functions, never in the browser. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Resolve the caller from the bearer token or fail with 401. */
export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const db = userClient(req)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) fail(401, 'unauthenticated')
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) fail(401, 'unauthenticated')
  return { user: data.user, db }
}

export const PHOTOS_BUCKET = 'photos'

/** List every object under a prefix (handles pagination). */
export async function listAllObjects(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const paths: string[] = []
  const limit = 1000
  let offset = 0
  for (;;) {
    const { data, error } = await admin.storage.from(PHOTOS_BUCKET).list(prefix, { limit, offset })
    if (error) throw error
    for (const entry of data ?? []) {
      // Entries without an id are folders; recurse into them.
      if (entry.id === null) {
        paths.push(...(await listAllObjects(admin, `${prefix}/${entry.name}`)))
      } else {
        paths.push(`${prefix}/${entry.name}`)
      }
    }
    if (!data || data.length < limit) break
    offset += limit
  }
  return paths
}

/** Remove objects through the Storage API in batches. Missing objects count as removed. */
export async function removeObjects(admin: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100)
    const { error } = await admin.storage.from(PHOTOS_BUCKET).remove(batch)
    if (error) throw error
  }
}

/** True once no object with this exact path exists any more. */
export async function objectGone(admin: SupabaseClient, path: string): Promise<boolean> {
  const idx = path.lastIndexOf('/')
  const folder = path.slice(0, idx)
  const file = path.slice(idx + 1)
  const { data, error } = await admin.storage.from(PHOTOS_BUCKET).list(folder, { search: file, limit: 10 })
  if (error) throw error
  return !(data ?? []).some((e) => e.name === file)
}
