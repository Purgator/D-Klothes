# D-Klothes

Private, invite-only app for small groups of friends deciding what to keep, let go, or offer to one another. A vote is advice: the app never disposes of or transfers clothing.

Stack: Vue 3 + TypeScript + Vite, Vue Router, vue-i18n (French default, English), Tailwind CSS, Supabase (Auth, PostgreSQL with RLS, private Storage, Realtime, Edge Functions).

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | Vue app: `views/` (one per route), `components/`, `composables/` (auth, group feed, signed photo URLs), `lib/` (pure helpers), `i18n/locales/` |
| `supabase/migrations/` | Versioned schema, RLS policies, RPCs, Storage bucket and policies, retention cron |
| `supabase/functions/` | Edge Functions for privileged operations (see below) |
| `supabase/tests/` | pgTAP tests for vote constraints, invitation lifecycle, membership and ownership boundaries |
| `tests/` | Vitest unit tests for the pure helpers and the JPEG metadata inspector |

## Local development

Prerequisites: Node 20+, Docker (for `supabase start`), the Supabase CLI (`npx supabase`).

```bash
npm install
cp .env.example .env.local        # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (printed by supabase start)
npx supabase start                # local Postgres, Auth, Storage, Realtime, Inbucket (magic-link emails at :54324)
npx supabase db reset             # applies supabase/migrations
npx supabase functions serve      # Edge Functions; needs the secrets below in supabase/functions/.env
npm run dev
```

Edge Function secrets (`supabase/functions/.env` locally, `supabase secrets set` in production):

| Name | Used by |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injected automatically by the platform |
| `APP_ORIGIN` | CORS allow-origin of the deployed app (defaults to `*` for local use) |
| `RETENTION_CLEANUP_SECRET` | shared secret checked by `retention-cleanup` |

The service-role key never leaves the Edge Functions. The browser only ever holds the anon key plus the user's session.

## Checks

```bash
npm run check        # vue-tsc typecheck + vitest + production build
npm run db:test      # pgTAP tests against the local stack (supabase start first)
npm run db:smoke     # end-to-end Edge Function checks (supabase start + functions serve first)
```

On Windows without Docker Desktop, Docker Engine inside WSL2 works: install `docker.io` and the Supabase CLI
in the distro and run the `supabase` commands from the repo path under `/mnt/c`.

## Privileged operations (Edge Functions)

| Function | What it does |
| --- | --- |
| `register-photo` | After the client uploads to `photos/<group>/<user>/<uuid>.jpg`, verifies membership, path ownership, size ≤ 2 MiB and the absence of EXIF/XMP/IPTC/COM segments, then inserts the item. Invalid uploads are deleted from Storage. |
| `delete-photo` | Uploader or group owner. Removes the Storage object, confirms it is gone, then deletes the record (votes cascade). |
| `delete-group` | Owner only, confirmed by typing the group name. Removes every object under the group prefix, then the group row. |
| `export-account` | ZIP archive with `account.json` (profile, memberships, requests, votes, item metadata) and the user's photo files. |
| `delete-account` | Requires a sign-in within the last 15 minutes and no owned groups. Removes photos via Storage, then the profile (cascades), then the Auth user. Idempotent. |
| `retention-cleanup` | Called daily by pg_cron (`20261101000200_retention_schedule.sql`) with `x-cleanup-secret`. Deletes expired photos object-first; items whose object cannot be confirmed gone are retried next run. |

Everything else (group creation, invitations, redemption, review, votes, ownership transfer, aggregate counts) is a `security definer` RPC in `20261101000000_init.sql` that checks `auth.uid()` explicitly.

## Retention scheduling

After deploying, store the cleanup URL and secret in Vault so the cron job can call the function:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/retention-cleanup', 'retention_cleanup_url');
select vault.create_secret('<RETENTION_CLEANUP_SECRET>', 'retention_cleanup_secret');
```

## Deployment notes

- Set `site_url` / redirect URLs in Supabase Auth to the deployed origin (`/auth/callback`).
- `VITE_SUPABASE_URL` drives the Content Security Policy injected into `index.html` at build time (`vite.config.ts`). Browsers ignore `frame-ancestors` in a meta tag, so set `Content-Security-Policy: frame-ancestors 'none'` (or `X-Frame-Options: DENY`) as an HTTP header at the host.
- The service worker precaches the app shell only; API responses, votes and photos are never cached.
- Check the provider's current terms, limits, region options and costs before choosing where to host. Nothing here promises a free or compliant deployment on its own.

## Security assumptions and open points

- RLS is deny-by-default; client writes are limited to own profile, own vote deletion, item title edits by the uploader, group rename by the owner, and member removal. Everything else goes through RPCs or Edge Functions.
- Realtime only publishes `group_feed_state` (a per-group version counter). Clients refetch through RLS-protected queries.
- Signed photo URLs live 10 minutes, in memory only.
- Client-side metadata stripping is verified server-side for JPEG segments; the check does not parse nested containers (e.g. MPF) beyond flagging their APP markers.
- `delete-account` relies on `last_sign_in_at` for the recent-session rule; a magic-link re-sign-in refreshes it.
- Verified locally on 2026-11-01: all three migrations apply, the 48 pgTAP assertions pass, and the 45-step Edge Function smoke test passes against a `supabase start` stack. Local Storage returns HTTP 400 with the real status (403/404) in the JSON body; the app reads error codes, not HTTP statuses, so this does not affect it.
