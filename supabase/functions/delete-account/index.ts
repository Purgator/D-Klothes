// Account deletion. Requires a recent sign-in, refuses while the user still owns a group,
// removes the user's photos through the Storage API, then the profile (rows cascade) and
// finally the Auth user. Every step is idempotent so a failed run can simply be retried.
import { serve, json, readJson, fail } from '../_shared/http.ts'
import { adminClient, requireUser, listAllObjects, removeObjects } from '../_shared/supabase.ts'

const RECENT_AUTH_MS = 15 * 60 * 1000

serve(async (req) => {
  const { user } = await requireUser(req)
  const body = await readJson<{ confirm?: unknown }>(req)
  if (body.confirm !== 'DELETE') fail(400, 'confirmation_required')

  const lastSignIn = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : 0
  if (!lastSignIn || Date.now() - lastSignIn > RECENT_AUTH_MS) {
    fail(403, 'recent_login_required')
  }

  const admin = adminClient()

  const { data: ownedGroups, error: ownedError } = await admin
    .from('groups')
    .select('id, name')
    .eq('owner_id', user.id)
  if (ownedError) throw ownedError
  if (ownedGroups && ownedGroups.length > 0) {
    return json({ error: 'owns_groups', groups: ownedGroups }, 409)
  }

  // Photos: every object under <group>/<user>/ for each group the user uploaded into.
  const { data: items, error: itemsError } = await admin
    .from('clothing_items')
    .select('group_id, storage_path')
    .eq('uploader_id', user.id)
  if (itemsError) throw itemsError
  // Uploads opened but not registered yet may have left a file too.
  const { data: uploads, error: uploadsError } = await admin
    .from('photo_uploads')
    .select('group_id')
    .eq('uploader_id', user.id)
  if (uploadsError) throw uploadsError
  const groupIds = [...new Set([...(items ?? []), ...(uploads ?? [])].map((i) => i.group_id as string))]
  for (const gid of groupIds) {
    const paths = await listAllObjects(admin, `${gid}/${user.id}`)
    await removeObjects(admin, paths)
    const remaining = await listAllObjects(admin, `${gid}/${user.id}`)
    if (remaining.length > 0) fail(502, 'storage_delete_failed')
  }

  // Profile deletion cascades to memberships, requests, items, votes.
  const { error: profileError } = await admin.from('profiles').delete().eq('id', user.id)
  if (profileError) throw profileError

  const { error: authError } = await admin.auth.admin.deleteUser(user.id)
  if (authError && !/not found/i.test(authError.message)) throw authError

  return json({ deleted: true })
})
