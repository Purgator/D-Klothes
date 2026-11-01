// Registers a photo the user already uploaded to the private bucket.
// Verifies membership, path ownership, size and absence of metadata in trusted code,
// then inserts the clothing record. Invalid uploads are removed from Storage.
import { serve, json, readJson, requireUuid, fail } from '../_shared/http.ts'
import { adminClient, requireUser, PHOTOS_BUCKET } from '../_shared/supabase.ts'
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

  const admin = adminClient()
  const { data: blob, error: dlError } = await admin.storage.from(PHOTOS_BUCKET).download(path)
  if (dlError || !blob) fail(404, 'object_not_found')

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const reject = async (code: string) => {
    await admin.storage.from(PHOTOS_BUCKET).remove([path])
    fail(422, code)
  }
  if (bytes.byteLength > MAX_BYTES) await reject('too_large')
  const inspection = inspectJpeg(bytes)
  if (!inspection.isJpeg) await reject('not_jpeg')
  if (inspection.metadataSegments.length > 0) await reject('metadata_present')

  const { data: item, error } = await admin
    .from('clothing_items')
    .insert({ group_id: groupId, uploader_id: user.id, storage_path: path, title })
    .select()
    .single()
  if (error) {
    // Duplicate registration of the same object is idempotent.
    if (error.code === '23505') {
      const { data: existing } = await admin.from('clothing_items').select().eq('storage_path', path).single()
      return json({ item: existing })
    }
    throw error
  }
  return json({ item }, 201)
})
