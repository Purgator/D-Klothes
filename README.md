# D-Klothes

**Decide together what to keep, let go, or offer to friends.**

D-Klothes is a private, invite-only web app for a small group of friends (5 to 20 people)
sorting out their wardrobes. You photograph a piece of clothing, your friends tell you
*Keep*, *Let go* or *I want this*, and you decide. Nothing happens automatically: a vote is
advice, the app never disposes of or transfers anything, and you arrange any hand-over
yourself.

👉 **Open the app: [purgator.github.io/D-Klothes](https://purgator.github.io/D-Klothes/)**

Installable on iPhone and Android as a web app. French and English, chosen from your device
and switchable at any time. The welcome page at
[purgator.github.io/D-Klothes/welcome](https://purgator.github.io/D-Klothes/welcome) explains
the app in both languages and is the link to share with friends.

## Installing on your phone

D-Klothes is not in an app store: it installs straight from the browser, in three taps, and then
opens like any other app. You need an invitation link from a friend to join their group.

**iPhone or iPad (Safari)**

1. Open <https://purgator.github.io/D-Klothes/> in Safari (other browsers cannot install it on iOS).
2. Tap the **Share** button at the bottom (the square with an arrow pointing up).
3. Scroll down, tap **Add to Home Screen**, then **Add**.

**Android (Chrome)**

1. Open <https://purgator.github.io/D-Klothes/> in Chrome.
2. Tap the **⋮** menu in the top-right corner.
3. Tap **Install app** (or **Add to Home screen**), then confirm.

**Computer (Chrome or Edge)**

1. Open <https://purgator.github.io/D-Klothes/>.
2. Click the small **install** icon at the right end of the address bar.
3. Confirm: the app opens in its own window.

Nothing to install if you prefer: the site works the same in the browser. Sign in with your email
address; you receive a link to click, there is no password.

## Features

- **Sign in by email link.** No password. You pick a display name once.
- **Groups you control.** Create a group, invite friends with single-use links that expire
  after 24 hours, and approve or decline each request yourself. Choose whether every member
  or only you can add photos. Transfer ownership or delete the group whenever you want.
- **Photos, not metadata.** Each photo is downscaled and recompressed in your browser (2 MiB
  max) and its EXIF data (location, device, date) is removed before upload. The server checks
  again and refuses anything that still carries metadata.
- **One vote per person per item, changeable.** Keep, Let go or I want this. Everyone sees the
  counts; nobody sees who voted Keep or Let go. Only the uploader sees who is interested.
- **Live feed.** Votes and new photos show up in open sessions without reloading.
- **Two-year retention.** Every photo shows the date it will be deleted. Uploaders get an
  in-app notice 30 days before. Delete sooner whenever you like.
- **Review first.** A group opens on the photos you have not given your advice on yet, one
  card at a time: drag right to Keep, left to Let go, up for I want this (buttons and arrow
  keys work too), with undo. The full collection, with counts and everyone's photos, is one
  tap away.
- **Notifications.** A bell with an unread badge, updated live, and a page with history: someone
  asks to join your group, your request is answered, a friend joins or adds a photo, someone wants
  one of yours. Several people wanting the same item, or several photos added in a row by the
  same friend, show as one line. Owners also see "N requests waiting" on the home page and the
  group page, and the group settings keep a history of approved and declined requests.
- **Quiet when you want.** Choose on the account page which kinds of notification you receive,
  mute a single group from its settings, and turn the haptic feedback off per device. Withdrawing
  an "I want this" settles the uploader's notification by itself.
- **Your data stays yours.** Export everything (profile, memberships, votes, photos) as a ZIP,
  or delete your account entirely.

## Free and premium accounts

This deployment is meant for the maintainer's own friends, so every new account is **free** with
strict limits, and the maintainer grants **premium** by hand. Anyone else is welcome to run their
own copy with their own Supabase project (see *Deploying*).

| Limit | Free | Premium |
| --- | --- | --- |
| Groups you own | 1 | 20 |
| Members per group you own (owner included) | 5 | 50 |
| Photos you upload | 10 | 500 |
| Active invitation links per group | 3 | 50 |

Limits are enforced in the database (RPCs and triggers), not in the interface, so a modified
frontend cannot bypass them. The tier column cannot be changed by any client call. To grant or
revoke premium, run this as the database administrator (Supabase Studio → SQL editor, or `psql`
with the service role):

```sql
select public.set_account_tier('friend@example.com', 'premium', 'optional note');
select public.set_account_tier('friend@example.com', 'free');
```

The account page shows each user their plan, limits and current usage. To change the limits,
add a migration that redefines `public.tier_limit()` and update this table.

## Privacy

Photos and votes are visible only to approved members of the same group, enforced by database
policies and private storage, not just by the interface. There is no analytics, no tracking,
and no private data cached in the browser. See [AGENTS.md](AGENTS.md) for the full product and
security guide, including what still has to be verified before a public launch (privacy notice,
lawful basis, hosting terms).

## For developers

Vue 3 + TypeScript + Vite, Vue Router, vue-i18n, Tailwind CSS. Backend on Supabase: Auth,
PostgreSQL with row-level security, private Storage, Realtime and Edge Functions.

| Path | Purpose |
| --- | --- |
| `src/views/` | One component per route (sign-in, onboarding, groups, feed, upload, item, settings, invite, account) |
| `src/composables/` | Auth state, group feed with Realtime refetch, signed photo URLs |
| `src/lib/` | Pure helpers: image preparation, retention, invitations, votes, error mapping |
| `src/i18n/locales/` | French (default) and English resources; a test keeps them in sync |
| `supabase/migrations/` | Schema, RLS policies, RPCs, Storage bucket and policies, retention cron |
| `supabase/functions/` | Edge Functions for privileged operations, plus an end-to-end smoke test |
| `supabase/tests/` | pgTAP tests for vote constraints, invitation lifecycle, membership and ownership boundaries |
| `tests/` | Vitest unit tests |

### Run locally

Prerequisites: Node 22+, Docker, the Supabase CLI.

```bash
npm install
npx supabase start                # local Postgres, Auth, Storage, Realtime, Mailpit (emails at :54324)
cp .env.example .env.local        # paste the API URL and anon key printed by `supabase start`
printf 'RETENTION_CLEANUP_SECRET=local-secret\n' > supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env
npm run dev
```

Then open <http://localhost:5173>. Magic-link emails land in Mailpit at <http://127.0.0.1:54324>:
open the message and click its link. To play two friends, use a second browser profile or a
private window so each has its own session.

#### On Windows without Docker Desktop

Docker Engine inside WSL2 works and needs no Windows admin rights. In the Ubuntu distro, once:

```bash
wsl -u root -- bash -c "apt-get update && apt-get install -y docker.io && systemctl enable --now docker"
wsl -u root -- bash -c "curl -fsSL -o /tmp/supabase.deb https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.deb; dpkg -i /tmp/supabase.deb"
```

Then run the Supabase commands from the repo path under `/mnt/c` (the first start downloads
about 2 GB of images), and the frontend from Windows as usual:

```bash
wsl -u root -- bash -c "cd /mnt/c/dev/Perso/D-Klothes && supabase start -x studio,vector,logflare"
wsl -u root -- bash -c "cd /mnt/c/dev/Perso/D-Klothes && supabase functions serve --env-file supabase/functions/.env"
npm run dev
```

The ports (54321 API, 54322 Postgres, 54324 Mailpit) are reachable from Windows at
`127.0.0.1`. Stop everything with `supabase stop` the same way. If the `.deb` name has changed,
pick the `linux_amd64.deb` asset from the latest release on GitHub.

### Checks

```bash
npm run check        # vue-tsc typecheck + vitest + production build
npm run db:test      # pgTAP tests against the local stack
npm run db:smoke     # end-to-end Edge Function checks (functions must be served)
npm run db:types     # regenerate src/types/database.gen.ts after a migration
```

`.github/workflows/pages.yml` runs the frontend checks and deploys `main` to GitHub Pages;
`.github/workflows/backend.yml` runs the pgTAP and smoke tests on a throwaway stack.

### Privileged operations (Edge Functions)

| Function | What it does |
| --- | --- |
| `register-photo` | After the client uploads to `photos/<group>/<user>/<uuid>.jpg`, verifies membership, the group's upload policy, path ownership, size ≤ 2 MiB and the absence of EXIF/XMP/IPTC/COM segments, then inserts the item. Invalid uploads, and uploads beyond the account's photo limit, are deleted from Storage. |
| `delete-photo` | Uploader or group owner. Removes the Storage object, confirms it is gone, then deletes the record (votes cascade). |
| `delete-group` | Owner only, confirmed by typing the group name. Removes every object under the group prefix, then the group row. |
| `export-account` | ZIP archive with `account.json` (profile, memberships, requests, votes, item metadata) and the user's photo files. |
| `delete-account` | Requires a sign-in within the last 15 minutes and no owned groups. Removes photos via Storage, then the profile (cascades), then the Auth user. Idempotent. |
| `retention-cleanup` | Called daily by pg_cron with `x-cleanup-secret`. Deletes expired photos object-first; items whose object cannot be confirmed gone are retried next run. |

Everything else (group creation, invitations, redemption, review, votes, ownership transfer,
aggregate counts) is a `security definer` RPC that checks `auth.uid()` explicitly.

### Deploying

1. Create a Supabase project, then `supabase link`, `supabase db push` and
   `supabase functions deploy`. Set the function secrets with `supabase secrets set`:

   | Name | Used by |
   | --- | --- |
   | `APP_ORIGIN` | CORS allow-origin of the deployed app |
   | `RETENTION_CLEANUP_SECRET` | shared secret checked by `retention-cleanup` |

2. In Supabase Auth, set the site URL and add `<origin>/<base>/auth/callback` to the redirect URLs.
   Apply the branded sign-in email (`supabase/templates/magic_link.html`, subject in
   `supabase/config.toml`) to both the *Magic Link* and *Confirm signup* templates, in the
   dashboard or through the Management API. On the free plan this needs a custom SMTP provider
   first (Authentication → SMTP settings): without one, Supabase keeps its own templates and
   sender name. Do not run `supabase config push` blindly: the auth URLs in `config.toml` are the
   local ones.
3. Store the cleanup URL and secret in Vault so the cron job can call the function:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/retention-cleanup', 'retention_cleanup_url');
   select vault.create_secret('<RETENTION_CLEANUP_SECRET>', 'retention_cleanup_secret');
   ```

4. Set the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` so the Pages
   workflow builds against the project. Until then the deployed site shows a "not configured"
   notice.

`VITE_SUPABASE_URL` also drives the Content Security Policy injected into `index.html` at build
time. Browsers ignore `frame-ancestors` in a meta tag, so set it (or `X-Frame-Options: DENY`) as an
HTTP header where the host allows it. Check the provider's current terms, limits, regions and
costs before relying on any plan; nothing here promises a free or compliant deployment.

### Security notes

- RLS is deny-by-default. Client writes are limited to the own profile, own vote deletion, item
  title edits by the uploader, group rename by the owner, and member removal. Everything else
  goes through RPCs or Edge Functions.
- Realtime publishes only `group_feed_state`, a per-group version counter; clients refetch
  through RLS-protected queries.
- Signed photo URLs live 10 minutes, in memory only.
- `delete-account` relies on `last_sign_in_at` for the recent-session rule; a magic-link
  re-sign-in refreshes it.
- The local Storage API returns HTTP 400 with the real status (403/404) in the JSON body; the
  app reads error codes, not HTTP statuses.

## License

[GNU General Public License v3.0 or later](LICENSE) (`GPL-3.0-or-later`)
