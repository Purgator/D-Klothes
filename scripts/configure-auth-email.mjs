// Points the hosted Supabase project's sign-in emails at a real SMTP sender and applies
// the branded template, through the Management API (never `supabase config push`: the
// auth URLs in config.toml are the local ones).
//
//   node --env-file=.env.email scripts/configure-auth-email.mjs [--dry-run]
//
// Variables are described in .env.email.example. Nothing secret is printed.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)

function need(env, name) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing ${name} (see .env.email.example)`)
  return value
}

/** Subject and template path of one `[auth.email.template.<kind>]` block of config.toml. */
export function templateFromConfig(toml, kind) {
  const start = toml.indexOf(`[auth.email.template.${kind}]`)
  if (start < 0) throw new Error(`config.toml has no [auth.email.template.${kind}] block`)
  const rest = toml.slice(start + 1)
  const next = rest.search(/^\[/m)
  const block = next < 0 ? rest : rest.slice(0, next)
  const subject = block.match(/^subject\s*=\s*"(.*)"\s*$/m)?.[1]
  const contentPath = block.match(/^content_path\s*=\s*"(.*)"\s*$/m)?.[1]
  if (!subject || !contentPath) throw new Error(`Incomplete [auth.email.template.${kind}] block`)
  return { subject, contentPath }
}

export function buildPayload(env, templates) {
  const host = need(env, 'SMTP_HOST')
  const user = need(env, 'SMTP_USER')
  let pass = need(env, 'SMTP_PASS')
  // Google shows app passwords in four spaced groups; the spaces are not part of it.
  if (host === 'smtp.gmail.com') pass = pass.replace(/\s+/g, '')
  const sender = env.SMTP_SENDER_EMAIL?.trim() || user
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sender)) {
    throw new Error('SMTP_SENDER_EMAIL must be an email address (SMTP_USER is not one)')
  }
  const perHour = Number(env.EMAIL_RATE_LIMIT_PER_HOUR?.trim() || 30)
  if (!Number.isInteger(perHour) || perHour < 1) throw new Error('EMAIL_RATE_LIMIT_PER_HOUR must be a positive integer')

  return {
    external_email_enabled: true,
    smtp_host: host,
    smtp_port: env.SMTP_PORT?.trim() || '587',
    smtp_user: user,
    smtp_pass: pass,
    smtp_admin_email: sender,
    smtp_sender_name: env.SMTP_SENDER_NAME?.trim() || 'D-Klothes',
    // One email per address per minute, and a project-wide hourly ceiling.
    smtp_max_frequency: 60,
    rate_limit_email_sent: perHour,
    mailer_subjects_magic_link: templates.magic_link.subject,
    mailer_templates_magic_link_content: templates.magic_link.content,
    mailer_subjects_confirmation: templates.confirmation.subject,
    mailer_templates_confirmation_content: templates.confirmation.content,
  }
}

async function loadTemplates() {
  const toml = await readFile(new URL('supabase/config.toml', root), 'utf8')
  const templates = {}
  for (const kind of ['magic_link', 'confirmation']) {
    const { subject, contentPath } = templateFromConfig(toml, kind)
    templates[kind] = { subject, content: await readFile(new URL(contentPath, root), 'utf8') }
  }
  return templates
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const payload = buildPayload(process.env, await loadTemplates())

  const shown = { ...payload, smtp_pass: '(hidden)' }
  for (const key of Object.keys(shown)) {
    if (key.endsWith('_content')) shown[key] = `(${payload[key].length} characters)`
  }
  console.log(shown)

  if (dryRun) {
    console.log('Dry run: nothing was sent.')
    return
  }

  const ref = need(process.env, 'SUPABASE_PROJECT_REF')
  const token = need(process.env, 'SUPABASE_ACCESS_TOKEN')
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    // The error body describes the rejected field; it does not echo the password.
    throw new Error(`Management API answered ${response.status}: ${(await response.text()).slice(0, 500)}`)
  }
  console.log(`Sign-in emails for project ${ref} now go through ${payload.smtp_host} as ${payload.smtp_admin_email}.`)
  console.log('Check it: request a sign-in link in the app with an address that is not on the Supabase team.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
