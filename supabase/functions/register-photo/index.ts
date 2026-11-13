// Last step of an upload: open_photo_upload() reserved the path, the client uploaded the
// file to it, and this function validates it. Verifies membership, path ownership, size and
// absence of metadata in trusted code, then turns the reservation into the clothing record.
// Invalid uploads are removed from Storage and their reservation is given back.
import { serve, json, readJson, requireUuid, fail } from '../_shared/http.ts'
import { adminClient, objectGone, requireUser, PHOTOS_BUCKET } from '../_shared/supabase.ts'
import { inspectJpeg } from '../_shared/jpeg.ts'

const MAX_BYTES = 2 * 1024 * 1024
const PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.jpg$/i

interface Body {
  group_id?: unknown
  path?: unknown
  title?: unknown
}

serve(async (req) => {
  const { user, db } = await requireUser(req)
  const body = await readJson<Body>(req)
  const groupId = requireUuid(body.group_id, 'group_id')
  const path = typeof body.path === 'string' ? body.path : fail(400, 'invalid_field', 'path')
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''

  const match = PATH_RE.exec(path)
  if (!match || match[1]!.toLowerCase() !== groupId || match[2]!.toLowerCase() !== user.id.toLowerCase()) {
    fail(400, 'invalid_path')
  }

  // Membership check through the user's own RLS-scoped client.
  const { data: membership } = await db
    .from('group_members')
    .select('group_id')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) fail(403, 'not_a_member')
  // The group may restrict uploads to its owner (also enforced by Storage and a trigger).
  const { data: canUpload } = await db.rpc('can_upload_to_group', { p_group_id: groupId })
  if (canUpload !== true) fail(403, 'upload_not_allowed')

  const admin = adminClient()
  // Registering the same file twice is idempotent: the second call finds the record.
  const registered = async () => {
    const { data } = await admin
      .from('clothing_items')
      .select()
      .eq('storage_path', path)
      .eq('uploader_id', user.id)
      .maybeSingle()
    return data
  }
  const { data: reservation, error: resError } = await admin
    .from('photo_uploads')
    .select('storage_path')
    .eq('storage_path', path)
    .eq('uploader_id', user.id)
    .maybeSingle()
  if (resError) throw resError
  if (!reservation) {
    const existing = await registered()
    if (existing) return json({ item: existing })
    fail(404, 'upload_not_opened')
  }

  const { data: blob, error: dlError } = await admin.storage.from(PHOTOS_BUCKET).download(path)
  if (dlError || !blob) fail(404, 'object_not_found')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  // The file goes first; the reservation only once the file is confirmed gone, so the cleanup
  // still knows about anything that could not be removed.
  const reject = async (code: string) => {
    await admin.storage.from(PHOTOS_BUCKET).remove([path])
    if (await objectGone(admin, path)) {
      await admin.from('photo_uploads').delete().eq('storage_path', path)
    }
    fail(422, code)
  }
  if (bytes.byteLength > MAX_BYTES) await reject('too_large')
  const inspection = inspectJpeg(bytes)
  if (!inspection.isJpeg) await reject('not_jpeg')
  if (inspection.metadataSegments.length > 0) await reject('metadata_present')

  const { data: item, error } = await admin
    .rpc('complete_photo_upload', { p_path: path, p_uploader: user.id, p_title: title })
    .single()
  if (error) {
    // Photo limit of the uploader's tier (database trigger): remove the object and say so.
    if (error.code === 'P0013') await reject('limit_photos')
    if (error.code === 'P0014') await reject('upload_not_allowed')
    // The reservation went meanwhile: a concurrent call registered the file, or it expired.
    if (error.code === 'P0017') {
      const existing = await registered()
      if (existing) return json({ item: existing })
      fail(404, 'upload_not_opened')
    }
    throw error
  }
  return json({ item }, 201)
})
