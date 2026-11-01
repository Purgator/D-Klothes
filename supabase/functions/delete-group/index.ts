// Explicit group deletion by its owner. Removes every photo object of the group
// through the Storage API before deleting the group row (members, items, votes cascade).
import { serve, json, readJson, requireUuid, fail } from '../_shared/http.ts'
import { adminClient, requireUser, listAllObjects, removeObjects } from '../_shared/supabase.ts'

serve(async (req) => {
  const { user } = await requireUser(req)
  const body = await readJson<{ group_id?: unknown; confirm_name?: unknown }>(req)
  const groupId = requireUuid(body.group_id, 'group_id')

  const admin = adminClient()
  const { data: group } = await admin.from('groups').select('id, name, owner_id').eq('id', groupId).maybeSingle()
  if (!group) fail(404, 'not_found')
  if (group.owner_id !== user.id) fail(403, 'forbidden')
  if (typeof body.confirm_name !== 'string' || body.confirm_name.trim() !== group.name) {
    fail(400, 'confirmation_mismatch')
  }

  const paths = await listAllObjects(admin, groupId)
  await removeObjects(admin, paths)
  const remaining = await listAllObjects(admin, groupId)
  if (remaining.length > 0) fail(502, 'storage_delete_failed')

  const { error } = await admin.from('groups').delete().eq('id', groupId)
  if (error) throw error
  return json({ deleted: true, photos_removed: paths.length })
})
