// Deletes a photo: Storage object first, then votes and the record (cascade).
// Allowed for the uploader or the group owner. Safe to retry.
import { serve, json, readJson, requireUuid, fail } from '../_shared/http.ts'
import { adminClient, requireUser, objectGone, removeObjects } from '../_shared/supabase.ts'

serve(async (req) => {
  const { user, db } = await requireUser(req)
  const body = await readJson<{ item_id?: unknown }>(req)
  const itemId = requireUuid(body.item_id, 'item_id')

  // The user's RLS-scoped read tells us whether they may even see the item.
  const { data: item } = await db
    .from('clothing_items')
    .select('id, group_id, uploader_id, storage_path, groups!inner(owner_id)')
    .eq('id', itemId)
    .maybeSingle()
  if (!item) fail(404, 'not_found')

  const ownerId = (item as unknown as { groups: { owner_id: string } }).groups.owner_id
  if (item.uploader_id !== user.id && ownerId !== user.id) fail(403, 'forbidden')

  const admin = adminClient()
  await removeObjects(admin, [item.storage_path])
  if (!(await objectGone(admin, item.storage_path))) fail(502, 'storage_delete_failed')

  const { error } = await admin.from('clothing_items').delete().eq('id', itemId)
  if (error) throw error
  return json({ deleted: true })
})
