// Scheduled cleanup, in three passes. Each one deletes the Storage object first and only
// forgets about it once the object is confirmed gone, so a partial failure is retried.
//   1. Photos whose retention deadline has passed: object, then the record (votes cascade).
//   2. Uploads opened more than an hour ago and never registered: object, then the reservation.
//   3. Files of the bucket with neither a record nor a reservation.
import { serve, json, fail } from '../_shared/http.ts'
import { adminClient, objectGone, removeObjects } from '../_shared/supabase.ts'

const BATCH = 100
const STALE_UPLOAD_MS = 60 * 60 * 1000

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

  // Abandoned uploads. A reservation can no longer be completed after 45 minutes, so nothing
  // races with this pass.
  const { data: stale, error: staleError } = await admin
    .from('photo_uploads')
    .select('storage_path')
    .lt('created_at', new Date(Date.now() - STALE_UPLOAD_MS).toISOString())
    .order('created_at')
    .limit(BATCH)
  if (staleError) throw staleError
  let uploadsCleared = 0
  let uploadsFailed = 0
  for (const upload of stale ?? []) {
    try {
      await removeObjects(admin, [upload.storage_path])
      if (!(await objectGone(admin, upload.storage_path))) {
        uploadsFailed += 1
        continue
      }
      const { error: delError } = await admin.from('photo_uploads').delete().eq('storage_path', upload.storage_path)
      if (delError) throw delError
      uploadsCleared += 1
    } catch (err) {
      console.error('cleanup failed for an abandoned upload', err instanceof Error ? err.message : String(err))
      uploadsFailed += 1
    }
  }

  // Files nothing points to (a reservation that went with its group or account, for instance).
  const { data: orphans, error: orphanError } = await admin.rpc('orphan_photo_paths', { p_limit: BATCH })
  if (orphanError) throw orphanError
  const orphanPaths = (orphans ?? []) as string[]
  let orphansRemoved = 0
  try {
    await removeObjects(admin, orphanPaths)
    orphansRemoved = orphanPaths.length
  } catch (err) {
    console.error('cleanup failed for orphan files', err instanceof Error ? err.message : String(err))
  }

  return json({
    scanned: expired?.length ?? 0,
    deleted,
    failed: failures,
    uploads_cleared: uploadsCleared,
    uploads_failed: uploadsFailed,
    orphans_removed: orphansRemoved,
    more: [expired, stale, orphanPaths].some((list) => (list?.length ?? 0) === BATCH),
  })
})
