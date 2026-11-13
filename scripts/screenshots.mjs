// Regenerates the README screenshots in docs/ from the real interface, with demo data only.
//
//   node scripts/screenshots.mjs            English interface (the README's language)
//   LOCALE=fr node scripts/screenshots.mjs  French interface
//   PORT=6825 node scripts/screenshots.mjs  another port (default 6821)
//
// The script starts its own Vite dev server, opens the app in headless Chrome at a phone
// viewport and writes one PNG per screen. No Supabase project is involved: the app is pointed
// at the dev server's own origin, every API call (REST, RPC, Storage, Auth) is answered here
// from the fictional data below, the Realtime socket is replaced by a stub, and any request
// to another host is blocked and makes the run fail. `.env.local` is never used. The "photos"
// are drawings generated below, so no real wardrobe or person appears in the pictures.
//
// Puppeteer is deliberately not a dependency of this project. The script imports it from this
// repository when it is there (`npm install --no-save puppeteer`), otherwise from the folder
// named by PUPPETEER_DIR, which must contain `node_modules/puppeteer`:
//
//   PUPPETEER_DIR=/path/to/a/project/with/puppeteer node scripts/screenshots.mjs
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docs = path.join(root, 'docs')
const port = Number(process.env.PORT || 6821)
const origin = `http://localhost:${port}`
const locale = process.env.LOCALE === 'fr' ? 'fr' : 'en'

async function loadPuppeteer() {
  try {
    return (await import('puppeteer')).default
  } catch {
    const dir = process.env.PUPPETEER_DIR
    if (!dir) throw new Error('puppeteer not found: install it with --no-save or set PUPPETEER_DIR (see the top of this file)')
    const require = createRequire(path.join(path.resolve(dir), 'package.json'))
    return (await import(pathToFileURL(require.resolve('puppeteer')).href)).default
  }
}

// ---- Demo data ------------------------------------------------------------------------

const now = Date.now()
const ago = (hours) => new Date(now - hours * 3600e3).toISOString()
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const people = ['Camille', 'Noor', 'Jonas', 'Maya', 'Theo', 'Ines'].map((display_name, i) => ({ id: uuid(i + 1), display_name }))
const [me, noor, jonas, maya, theo, ines] = people
const profile = { ...me, created_at: ago(24 * 90), updated_at: ago(24 * 90), muted_kinds: [], tier: 'free', tier_granted_at: null, tier_note: null }

const flat = { id: uuid(101), name: 'Flatmates', owner_id: me.id, members_can_upload: true, created_at: ago(24 * 80) }
const swap = { id: uuid(102), name: 'Sunday swap club', owner_id: ines.id, members_can_upload: true, created_at: ago(24 * 40) }
const groups = [flat, swap]
const rosters = { [flat.id]: [me, noor, jonas, maya, theo], [swap.id]: [ines, me, maya, noor] }

// One row per photo: [group, uploader, title, hours ago, drawing, keep, let go, want, my advice].
const wardrobe = [
  [flat, noor, 'Mustard knit sweater', 50, { kind: 'sweater', color: '#d9a31f', wall: '#e9e4da' }, 2, 1, 1, null],
  [flat, maya, 'Polka dot summer dress', 70, { kind: 'dress', color: '#27457a', pattern: 'dots', wall: '#f1e3dc' }, 1, 0, 2, null],
  [flat, me, 'Vintage denim jacket', 150, { kind: 'jacket', color: '#5b84b1', wall: '#ece6dc' }, 3, 0, 3, null],
  [flat, jonas, 'Striped Breton top', 120, { kind: 'tee', color: '#f4f1ea', pattern: 'stripes', accent: '#1f3157', wall: '#dfe6e8' }, 3, 1, 0, 'keep'],
  [flat, me, 'High-waisted jeans', 200, { kind: 'jeans', color: '#3d5a80', wall: '#eadfd3' }, 1, 3, 0, null],
  [flat, maya, 'Pleated green skirt', 170, { kind: 'skirt', color: '#2f7d5b', wall: '#ece9df' }, 1, 0, 2, 'want'],
  [flat, theo, 'Red wool coat', 220, { kind: 'coat', color: '#b3262e', wall: '#e3e1dc' }, 0, 3, 1, 'let_go'],
  [flat, noor, 'White linen shirt', 26, { kind: 'jacket', color: '#f3efe6', wall: '#d9e2dc' }, 1, 0, 0, null],
  [flat, theo, 'Grey hoodie', 240, { kind: 'sweater', color: '#8d939c', wall: '#e8e2e6' }, 4, 0, 0, 'keep'],
  [flat, me, 'Lilac tee', 290, { kind: 'tee', color: '#b9a3e3', wall: '#ebe7df' }, 2, 2, 0, null],
  [flat, jonas, 'Check flannel shirt', 96, { kind: 'jacket', color: '#a8432f', pattern: 'check', accent: '#3b1d18', wall: '#e4e0d4' }, 1, 2, 0, 'let_go'],
  [flat, theo, 'Navy chinos', 11, { kind: 'jeans', color: '#27334d', wall: '#e9e1d2' }, 0, 0, 1, null],
  [swap, ines, 'Terracotta cardigan', 36, { kind: 'jacket', color: '#c4623c', wall: '#e6e3da' }, 1, 0, 1, null],
  [swap, maya, 'Floral midi skirt', 130, { kind: 'skirt', color: '#d76a8a', pattern: 'dots', accent: '#fbe3ea', wall: '#e7ebe4' }, 2, 0, 1, 'keep'],
  [swap, me, 'Black skinny jeans', 180, { kind: 'jeans', color: '#2b2b2f', wall: '#e8e4dc' }, 0, 2, 1, null],
  [swap, noor, 'Teal oversized tee', 6, { kind: 'tee', color: '#1f8f86', wall: '#efe6dd' }, 0, 0, 0, null],
]
const items = wardrobe.map(([group, uploader, title, hours, art, keep, letGo, want, mine], i) => {
  const id = uuid(1001 + i)
  return {
    row: {
      id,
      group_id: group.id,
      uploader_id: uploader.id,
      title,
      storage_path: `${group.id}/${uploader.id}/${id}.jpg`,
      created_at: ago(hours),
      retention_deadline: new Date(now + (730 * 24 - hours) * 3600e3).toISOString(),
    },
    art,
    counts: { item_id: id, keep_count: keep, let_go_count: letGo, want_count: want },
    mine,
  }
})
const jacket = items[2]
const itemByTitle = (title) => items.find((i) => i.row.title === title).row

const notification = (n, kind, hours, read, actor, group, item = null, request = null) => ({
  id: uuid(5000 + n),
  kind,
  created_at: ago(hours),
  read_at: read ? ago(hours - 0.5) : null,
  actor_name: actor?.display_name ?? null,
  group_id: group.id,
  group_name: group.name,
  item_id: item?.id ?? null,
  item_title: item?.title ?? null,
  request_id: request,
})
const notifications = [
  notification(1, 'item_wanted', 2, false, noor, flat, jacket.row),
  notification(2, 'item_wanted', 5, false, jonas, flat, jacket.row),
  notification(10, 'item_wanted', 8, false, maya, flat, jacket.row),
  notification(3, 'membership_requested', 3, false, { display_name: 'Lou' }, flat, null, uuid(7001)),
  notification(4, 'item_added', 6, false, noor, swap, itemByTitle('Teal oversized tee')),
  notification(5, 'item_added', 11, false, theo, flat, itemByTitle('Navy chinos')),
  notification(6, 'item_added', 50, true, maya, flat, itemByTitle('Polka dot summer dress')),
  notification(7, 'item_added', 50.4, true, maya, flat, itemByTitle('Pleated green skirt')),
  notification(8, 'member_joined', 24 * 12, true, theo, flat),
  notification(9, 'request_approved', 24 * 30, true, ines, swap),
]

// ---- Drawn "photos": a garment on a hanger against a wall ---------------------------

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`
}

function garment({ kind, color }) {
  const dark = shade(color, -0.22)
  const line = `fill="none" stroke="${dark}" stroke-linecap="round"`
  const longSleeves = (hem) =>
    `M322 262 Q400 306 478 262 L572 292 Q640 330 660 470 L690 730 L612 744 L560 500 L556 ${hem} Q400 ${hem + 14} 244 ${hem} L240 500 L188 744 L110 730 L140 470 Q160 330 228 292 Z`
  const cuffs = `<path d="M110 730 L188 744 L194 712 L116 698 Z M690 730 L612 744 L606 712 L684 698 Z" fill="${dark}"/>`
  switch (kind) {
    case 'tee':
      return {
        shape: 'M318 262 Q400 318 482 262 L570 290 L690 420 L612 492 L548 432 L548 770 Q400 786 252 770 L252 432 L188 492 L110 420 L230 290 Z',
        details: `<path d="M318 262 Q400 318 482 262" ${line} stroke-width="14"/><path d="M196 484 L118 412 M604 484 L682 412" ${line} stroke-width="5"/><path d="M252 752 Q400 768 548 752" ${line} stroke-width="4"/>`,
      }
    case 'sweater':
      return {
        shape: longSleeves(790),
        details: `<path d="M244 750 Q400 764 556 750 L556 790 Q400 804 244 790 Z" fill="${dark}"/>${cuffs}<path d="M322 262 Q400 306 478 262" ${line} stroke-width="20"/>`,
      }
    case 'jacket':
    case 'coat': {
      const hem = kind === 'coat' ? 880 : 790
      const buttons = Array.from({ length: kind === 'coat' ? 5 : 4 }, (_, i) => `<circle cx="418" cy="${400 + i * 100}" r="9" fill="${dark}"/>`).join('')
      return {
        shape: longSleeves(hem),
        details: `<path d="M400 336 L400 ${hem + 6}" ${line} stroke-width="5"/>${buttons}${cuffs}<path d="M322 262 L400 340 L346 366 L296 282 Z M478 262 L400 340 L454 366 L504 282 Z" fill="${dark}"/><path d="M270 560 h74 M456 560 h74" ${line} stroke-width="5"/>`,
        bar: false,
      }
    }
    case 'dress':
      return {
        shape: 'M330 250 Q400 300 470 250 L510 262 Q500 360 486 440 Q480 470 500 520 L620 870 Q400 900 180 870 L300 520 Q320 470 314 440 Q300 360 290 262 Z',
        details: `<path d="M313 452 Q400 470 487 452" ${line} stroke-width="16"/><path d="M330 250 Q400 300 470 250" ${line} stroke-width="8"/><path d="M360 500 L300 874 M440 500 L500 874" ${line} stroke-width="3" opacity=".5"/>`,
      }
    case 'jeans':
      return {
        shape: 'M262 250 L538 250 L548 330 L572 890 L438 890 L404 470 L396 470 L362 890 L228 890 L252 330 Z',
        details: `<path d="M262 250 H538 L542 286 H258 Z" fill="${dark}"/><path d="M400 286 V470 M400 300 Q430 380 404 410" ${line} stroke-width="4"/><path d="M266 300 Q300 350 258 372 M534 300 Q500 350 542 372" ${line} stroke-width="4"/><path d="M232 866 H358 M442 866 H568" ${line} stroke-width="4" stroke-dasharray="10 8"/>`,
        bar: true,
      }
    case 'skirt':
      return {
        shape: 'M300 250 L500 250 L508 290 L640 740 Q400 772 160 740 L292 290 Z',
        details: `<path d="M300 250 H500 L506 288 H294 Z" fill="${dark}"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${318 + i * 33} 290 L${222 + i * 71} 752" ${line} stroke-width="3" opacity=".6"/>`).join('')}`,
        bar: true,
      }
  }
}

function photoSvg(art) {
  const { color, wall, pattern } = art
  const accent = art.accent ?? shade(color, 0.75)
  const { shape, details, bar } = garment(art)
  const fills = {
    stripes: `<pattern id="p" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="44" height="44" fill="${color}"/><rect width="44" height="15" fill="${accent}"/></pattern>`,
    dots: `<pattern id="p" width="46" height="46" patternUnits="userSpaceOnUse"><rect width="46" height="46" fill="${color}"/><circle cx="12" cy="12" r="6.5" fill="${accent}"/><circle cx="35" cy="35" r="6.5" fill="${accent}"/></pattern>`,
    check: `<pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${color}"/><rect width="20" height="64" fill="${accent}" opacity=".55"/><rect width="64" height="20" fill="${accent}" opacity=".55"/></pattern>`,
  }
  const hanger = bar
    ? '<path d="M256 252 H544" stroke="#b08a5b" stroke-width="16" stroke-linecap="round"/>'
    : '<path d="M400 226 L208 306 Q400 288 592 306 Z" fill="#b08a5b" stroke="#96734a" stroke-width="6" stroke-linejoin="round"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
<defs>
  <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(wall, 0.35)}"/><stop offset="1" stop-color="${shade(wall, -0.1)}"/></linearGradient>
  <radialGradient id="light" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></radialGradient>
  <linearGradient id="fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".16"/><stop offset=".3" stop-color="#fff" stop-opacity=".1"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="14" dy="20" stdDeviation="16" flood-color="#3a2f25" flood-opacity=".3"/></filter>
  ${pattern ? fills[pattern] : ''}
</defs>
<rect width="800" height="1000" fill="url(#wall)"/>
<rect y="940" width="800" height="60" fill="${shade(wall, -0.28)}"/><rect y="934" width="800" height="8" fill="${shade(wall, 0.5)}"/>
<rect width="800" height="1000" fill="url(#light)"/>
<path d="M0 132 H800" stroke="#8b8f94" stroke-width="12"/><path d="M0 127 H800" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>
<path d="M400 ${bar ? 252 : 232} V196 C400 176 432 174 432 148 A32 32 0 1 0 370 138" fill="none" stroke="#8b8f94" stroke-width="9" stroke-linecap="round"/>
<g filter="url(#shadow)">${hanger}<path d="${shape}" fill="${pattern ? 'url(#p)' : color}"/><path d="${shape}" fill="url(#fold)"/>${details}</g>
</svg>`
}

// ---- The fake backend -----------------------------------------------------------------

const json = (body, extra = {}) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body), ...extra })

function table(name, q) {
  const eq = (key) => (q.get(key)?.startsWith('eq.') ? q.get(key).slice(3) : null)
  switch (name) {
    case 'groups':
      return groups.filter((g) => !eq('id') || g.id === eq('id'))
    case 'profiles':
      return people
    case 'group_members':
      return groups
        .filter((g) => !eq('group_id') || g.id === eq('group_id'))
        .flatMap((g) => rosters[g.id].map((p) => ({ group_id: g.id, user_id: p.id, role: p.id === g.owner_id ? 'owner' : 'member', joined_at: g.created_at, profile: p })))
    case 'clothing_items': {
      const rows = items.map((i) => i.row).filter((r) => !eq('group_id') || r.group_id === eq('group_id'))
      const dir = q.get('order') === 'created_at.asc' ? 1 : -1
      return rows.sort((a, b) => dir * a.created_at.localeCompare(b.created_at))
    }
    case 'votes':
      // Either "who wants this photo" (uploader only) or the signed-in member's own advice.
      if (eq('item_id')) return eq('item_id') === jacket.row.id ? [noor, jonas, maya].map((p) => ({ voter_id: p.id, profiles: { display_name: p.display_name } })) : []
      return items.filter((i) => i.mine).map((i) => ({ item_id: i.row.id, vote: i.mine }))
    case 'membership_requests':
      return [{ id: uuid(7001), group_id: flat.id }].filter((r) => !eq('group_id') || r.group_id === eq('group_id'))
  }
  return null
}

function rpc(name, args) {
  switch (name) {
    case 'my_profile':
      return [profile]
    case 'my_notifications':
      return notifications
    case 'group_vote_counts':
      return items.filter((i) => i.row.group_id === args.p_group_id).map((i) => i.counts)
    case 'my_entitlements':
      return [{ tier: 'free', owned_groups: 1, owned_groups_limit: 1, group_members_limit: 5, photos: items.filter((i) => i.row.uploader_id === me.id).length, photos_limit: 10, active_invitations_limit: 3 }]
    case 'my_membership_requests':
    case 'my_retention_notices':
      return []
    case 'my_group_mute':
      return false
    case 'mark_notifications_read':
      return 0
    case 'cast_vote':
      return null
  }
  return undefined
}

const unknown = []
const blocked = []

function answer(request) {
  const url = new URL(request.url())
  if (url.hostname !== 'localhost') {
    blocked.push(url.origin)
    return 'abort'
  }
  const cut = (prefix) => (url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : null)
  const single = (request.headers().accept ?? '').includes('vnd.pgrst.object')

  const fn = cut('/rest/v1/rpc/')
  if (fn !== null) {
    const result = rpc(fn, JSON.parse(request.postData() || '{}'))
    if (result === undefined) unknown.push(`rpc ${fn}`)
    return json(single && Array.isArray(result) ? (result[0] ?? null) : (result ?? null))
  }
  const name = cut('/rest/v1/')
  if (name !== null) {
    const rows = table(name, url.searchParams)
    if (!rows) unknown.push(`table ${name}`)
    const list = rows ?? []
    const headers = { 'content-range': list.length ? `0-${list.length - 1}/${list.length}` : '*/0' }
    if (request.method() === 'HEAD') return { status: 200, headers }
    return json(single ? (list[0] ?? null) : list, { headers })
  }
  const photo = cut('/storage/v1/object/')
  if (photo !== null) {
    const item = items.find((i) => photo.endsWith(i.row.storage_path))
    return item ? { status: 200, contentType: 'image/svg+xml', body: photoSvg(item.art) } : { status: 404, contentType: 'application/json', body: '{"error":"not_found"}' }
  }
  if (cut('/auth/v1/') !== null) return json(session.user)
  if (cut('/functions/v1/') !== null || cut('/realtime/v1/') !== null) return json({})
  return 'continue'
}

// A signed-in session for the fictional member, as supabase-js would have stored it.
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
const expires = Math.floor(now / 1000) + 365 * 24 * 3600
const session = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: me.id, role: 'authenticated', aud: 'authenticated', exp: expires })}.demo`,
  token_type: 'bearer',
  expires_in: 365 * 24 * 3600,
  expires_at: expires,
  refresh_token: 'demo',
  user: { id: me.id, aud: 'authenticated', role: 'authenticated', email: 'camille@example.com', app_metadata: {}, user_metadata: {}, created_at: ago(24 * 90), last_sign_in_at: ago(1) },
}

/** Runs in the page before the app: session, language, and a Realtime socket that only says yes. */
function preparePage({ session, locale }) {
  localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session))
  localStorage.setItem('dklothes.locale', locale)
  const RealSocket = window.WebSocket
  class QuietSocket extends EventTarget {
    constructor(url) {
      super()
      this.url = url
      this.readyState = 0
      this.binaryType = 'arraybuffer'
      this.protocol = ''
      setTimeout(() => {
        this.readyState = 1
        this.emit('open')
      }, 20)
    }
    emit(type, init = {}) {
      const event = Object.assign(new Event(type), init)
      this[`on${type}`]?.(event)
      this.dispatchEvent(event)
    }
    send(data) {
      // Phoenix protocol v2: [join_ref, ref, topic, event, payload]. Every push is acknowledged.
      let message
      try {
        message = JSON.parse(data)
      } catch {
        return
      }
      if (!Array.isArray(message)) return
      const [joinRef, ref, topic, event, payload] = message
      const response = event === 'phx_join' ? { postgres_changes: (payload?.config?.postgres_changes ?? []).map((change, i) => ({ ...change, id: i + 1 })) } : {}
      setTimeout(() => this.emit('message', { data: JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]) }), 10)
    }
    close() {
      this.readyState = 3
      this.emit('close', { code: 1000, reason: '', wasClean: true })
    }
  }
  window.WebSocket = new Proxy(RealSocket, {
    construct: (target, args) => (String(args[0]).includes('/realtime/v1/') ? new QuietSocket(args[0]) : new target(...args)),
  })
}

// ---- Shooting -------------------------------------------------------------------------

// The app's values win over .env files when they are already in the environment.
process.env.VITE_SUPABASE_URL = origin
process.env.VITE_SUPABASE_ANON_KEY = 'demo-anon-key'
process.env.BASE_PATH = '/'

const puppeteer = await loadPuppeteer()
await mkdir(docs, { recursive: true })
const server = await createServer({ root, logLevel: 'warn', server: { port, strictPort: true, host: 'localhost' } })
await server.listen()
const browser = await puppeteer.launch()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1.5, isMobile: true, hasTouch: false })
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await page.evaluateOnNewDocument(preparePage, { session, locale })
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const reply = answer(request)
    if (reply === 'abort') void request.abort()
    else if (reply === 'continue') void request.continue()
    else void request.respond(reply)
  })
  page.on('pageerror', (err) => console.warn('page error:', err.message))

  /** Open a route and wait until nothing is loading any more: no placeholder, every photo drawn. */
  const open = async (route) => {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(
      () => document.querySelector('#app')?.childElementCount && !document.querySelector('.animate-pulse') && [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      { timeout: 15000 },
    )
    await wait(500)
  }
  const shoot = (name) => page.screenshot({ path: path.join(docs, `${name}.png`), optimizeForSpeed: false })

  // 1. The review deck, a card held to the right: "Keep".
  await open('/')
  const card = await (await page.waitForSelector('.swipe-card')).boundingBox()
  const x = card.x + card.width / 2
  const y = card.y + card.height * 0.45
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 118, y + 6, { steps: 12 })
  await wait(300)
  await shoot('review')
  await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()

  // 2. A group's collection.
  await open(`/groups/${flat.id}`)
  await shoot('collection')

  // 3. One of the member's own photos: the counts, and who would like to have it.
  await open(`/groups/${flat.id}/items/${jacket.row.id}`)
  await shoot('item')

  // 4. Notifications.
  await open('/notifications')
  await shoot('notifications')

  // 5. The account page: plan, limits and usage.
  await open('/account')
  await page.evaluate(() => document.querySelector('#about-title')?.scrollIntoView())
  await wait(300)
  await shoot('account')

  if (unknown.length) console.warn('calls without demo data:', [...new Set(unknown)].join(', '))
  if (blocked.length) throw new Error(`requests to other hosts were blocked: ${[...new Set(blocked)].join(', ')}`)
  console.log(`screenshots written to docs/ (${locale})`)
} finally {
  await browser.close()
  await server.close()
}
