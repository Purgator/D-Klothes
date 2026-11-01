// Scheduled retention cleanup. Deletes photos whose retention deadline has passed:
// Storage object first, then the record (votes cascade). Idempotent and partial-failure
// tolerant: an item is only removed from the database once its object is confirmed gone.
import { serve, json, fail } from '../_shared/http.ts'
import { adminClient, objectGone, removeObjects } from '../_shared/supabase.ts'

const BATCH = 100

serve(async (req) => {
  if (req.method !== 'POST') fail(405, 'method_not_allowed')
  const secret = Deno.env.get('RETENTION_CLEANUP_SECRET')
  if (!secret || req.headers.get('x-cleanup-secret') !== secret) fail(401, 'unauthenticated')

  const admin = adminClient()
  const { data: expired, error } = await admin
    .from('clothing_items')
    .select('id, storage_path')
    .lte('retention_deadline', new Date().toISOString())
    .order('retention_deadline')
    .limit(BATCH)
  if (error) throw error

  let deleted = 0
  const failures: string[] = []
  for (const item of expired ?? []) {
    try {
      await removeObjects(admin, [item.storage_path])
      if (!(await objectGone(admin, item.storage_path))) {
        failures.push(item.id)
        continue
      }
      const { error: delError } = await admin.from('clothing_items').delete().eq('id', item.id)
      if (delError) throw delError
      deleted += 1
    } catch (err) {
      console.error('retention cleanup failed for item', item.id, err instanceof Error ? err.message : String(err))
      failures.push(item.id)
    }
  }
  return json({ scanned: expired?.length ?? 0, deleted, failed: failures, more: (expired?.length ?? 0) === BATCH })
})
