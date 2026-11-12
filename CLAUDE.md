# Working in this repo

`AGENTS.md` is the product and security guide (scope, data model, authorization rules,
privacy commitments). This file covers how work gets done and shipped.

## Commits

Commit finished work yourself, without waiting to be asked. Every commit message starts
with a [gitmoji](https://gitmoji.dev) prefix (✨ feature, 🐛 fix, 🔒 security, 🗃️ database,
💄 UI, 📝 docs, 🔖 version bump, 👷 CI, ✅ tests), followed by a concise imperative summary,
matching the existing `git log`. Prefer several small, logical commits over one giant one.

## Definition of done

Work is not finished when it is committed on a branch. It is finished when it is on `main`,
pushed, and (for anything user-visible) published as a new semver release on GitHub, in the
same session. From a git worktree, `main` is checked out elsewhere: land the branch with
`git push origin HEAD:main` (must fast-forward; rebase first if it does not), then push the tag.

Semver: **patch** for fixes only, **minor** for anything user-visible that is new or changed,
**major** for a breaking change to the database schema that needs a data migration, or to
the export format.

## Checks before committing

```bash
npm run check       # vue-tsc, vitest, vite build
npm run db:test     # pgTAP, needs `supabase start`
npm run db:smoke    # Edge Functions end to end, needs `supabase functions serve` too
```

Schema changes always go in a new file under `supabase/migrations/` (never edit an applied
migration), with a pgTAP assertion in `supabase/tests/` for every new authorization rule, and
`npm run db:types` to refresh `src/types/database.gen.ts`. The API roles (`anon`, `authenticated`) start with nothing on new tables and functions
(`20261113000000_api_privileges.sql`): a migration grants exactly what its feature needs,
column by column for writes, and revokes `execute` from `public` on every new function. A
column a client should not read or write is left out of the grant and served by a security
definer function instead; row-level security alone does not protect columns.
Re-read the authorization boundary
for anything touching auth, RLS, invitations, Storage, retention or deletion (see `AGENTS.md`).

## Releases

1. `npm version X.Y.Z --no-git-tag-version` (the version shows on the account page).
2. Commit (`🔖 Bump version to X.Y.Z`), tag `vX.Y.Z`, push `main` and the tag. GitHub Pages
   deploys from `main` through `.github/workflows/pages.yml`.
3. `gh release create vX.Y.Z --title "D-Klothes X.Y.Z — <short subtitle>" --notes-file <notes>`
   with detailed notes: what is new, what changed, fixes, and any migration to apply.
4. If migrations changed, apply them to the hosted project (`supabase db push`) and redeploy
   the Edge Functions (`supabase functions deploy`) in the same release.

## Text encoding (Windows)

Non-ASCII text (emoji, accents, curly quotes) gets double-encoded when it goes through the
shell. Write or edit source files with the file tools, or with a script saved as a UTF-8
file and run by path, never from a shell heredoc or `-c`. Commit messages with emoji go
through a UTF-8 file: `git commit -F msg.txt`. The i18n test fails when French and English
resources drift apart.

## Product constraints

- A vote is advice. Nothing in the app disposes of, transfers or claims clothing.
- Individual Keep / Let go choices are never shown to anyone. Only the uploader sees who
  chose "I want this".
- No analytics, no tracking, no storing of private data in the browser (the service worker
  precaches the app shell only; the one exception is a photo shared into the app from another
  app, parked by the share-target handler and deleted the moment the app collects it).
  Photos are the deliberate exception at HTTP level: they are immutable, uploaded with a long
  max-age and read from a stable authenticated address, so the browser's own cache keeps them
  and each device downloads a photo once. Rows (profile, groups, votes) are never cached:
  they are refetched on the refresh button and when the app returns to the foreground.
- French is the default language; every user-facing string lives in both locale files.
