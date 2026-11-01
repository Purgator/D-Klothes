// Machine-readable export of the caller's data: profile, memberships, requests, votes,
// uploaded items and the photo files themselves, as a ZIP archive.
import JSZip from 'npm:jszip@3.10.1'
import { serve, fail, corsHeaders } from '../_shared/http.ts'
import { adminClient, requireUser, PHOTOS_BUCKET } from '../_shared/supabase.ts'

serve(async (req) => {
  if (req.method !== 'POST') fail(405, 'method_not_allowed')
  const { user, db } = await requireUser(req)

  // Everything the user may read about themselves goes through their RLS-scoped client.
  const [profile, memberships, requests, votes, items] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    db.from('group_members').select('group_id, role, joined_at, groups(name)').eq('user_id', user.id),
    db.from('membership_requests').select('group_id, message, status, created_at, reviewed_at').eq('user_id', user.id),
    db.from('votes').select('item_id, vote, created_at, updated_at').eq('voter_id', user.id),
    db.from('clothing_items').select('id, group_id, title, storage_path, created_at, retention_deadline').eq('uploader_id', user.id),
  ])
  for (const r of [profile, memberships, requests, votes, items]) {
    if (r.error) throw r.error
  }

  const zip = new JSZip()
  zip.file(
    'account.json',
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email, created_at: user.created_at },
        profile: profile.data,
        memberships: memberships.data,
        membership_requests: requests.data,
        votes: votes.data,
        photos: (items.data ?? []).map((i) => ({ ...i, file: `photos/${i.id}.jpg` })),
      },
      null,
      2,
    ),
  )

  // Photo files are fetched with the admin client after the RLS read above authorized them.
  const admin = adminClient()
  for (const item of items.data ?? []) {
    const { data, error } = await admin.storage.from(PHOTOS_BUCKET).download(item.storage_path)
    if (error || !data) {
      zip.file(`photos/${item.id}.missing.txt`, `Object ${item.storage_path} could not be read: ${error?.message ?? 'unknown'}`)
      continue
    }
    zip.file(`photos/${item.id}.jpg`, await data.arrayBuffer())
  }

  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return new Response(archive, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="dklothes-export-${user.id.slice(0, 8)}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
})
