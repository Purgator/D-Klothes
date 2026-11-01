# D-Klothes project guide

D-Klothes is a private, invite-only app for small groups of friends deciding what to keep, let go, or offer to one another. The app helps people decide; it does not dispose of or transfer clothing automatically.

Use D-Klothes as the display name and DKlothes for programmatic identifiers. The initial audience is groups of roughly 5–20 friends.

## Product decisions

### Stack

- Frontend: Vue 3, TypeScript, and Vite.
- Routing and translations: Vue Router and vue-i18n.
- Styling: Tailwind CSS.
- Backend: Supabase Auth, PostgreSQL, private Storage, and Realtime.
- Hosting is a deployment decision. Check current terms, limits, data region, and costs before choosing a provider. Do not promise a free deployment.
- Use a service worker only for the installable app shell in the MVP. Do not cache private API responses, votes, or photos.

Do not add a state-management library until shared state requires one. Keep the initial app structure small and follow the structure the scaffold creates.

### MVP

The first release supports:

1. Email magic-link sign-in and a required display name.
2. Creating a group and managing its owner.
3. Single-use invitation links that expire after 24 hours.
4. Membership requests with a short message; the group owner approves or rejects them.
5. Photo upload, compression to at most 2 MiB, and EXIF removal.
6. A group feed and one changeable vote per member per item: Keep, Let go, or I want this.
7. Aggregate vote counts. Only the photo uploader can see the names of people who chose I want this; individual Keep and Let go choices are private.
8. French and English UI, with French as the default and a visible language switcher.
9. Feed updates for open sessions through Supabase Realtime; fetch authorized data as the source of truth.
10. Account data export and account deletion.

A vote is advice, not an action on the item. Let go does not delete a photo or cause disposal. I want this expresses interest; it does not claim the item or disclose contact details. The uploader arranges any donation directly.

The MVP requires a network connection for private content and voting. Offline photo viewing, offline writes, push notifications, comments, categories, claims, search, and dark mode are out of scope. Revisit offline support only with an explicit privacy and conflict-handling design.

### Invitations and membership

- Only the group owner can create or revoke invitation links and review membership requests.
- Generate tokens using a cryptographically secure random source with at least 32 random bytes. Store only a hash of each token. Never log or expose tokens after link creation.
- Do not reveal a group's private content or member email addresses on the unauthenticated invitation page.
- Redeem a link through a trusted, atomic server-side operation. A successful redemption creates one pending request and consumes the single-use link. Rejection does not reactivate it.
- A pending or rejected applicant is not a group member and cannot read group data or photos.
- Approval adds the member and records who reviewed the request. Enforce these rules on the server and in database policies, not only in the UI.
- A group has one owner. Ownership transfer and group deletion must be explicit operations with authorization checks.

## Data model and authorization

Use versioned database migrations. Treat this list as a domain model, not executable SQL:

- User profiles, keyed to Supabase Auth users.
- Groups and group memberships, with an owner/member role.
- Hashed invitation tokens and membership requests.
- Clothing records with the group, uploader, private Storage object path, creation time, and retention deadline.
- Votes with a checked vote type and a unique constraint on item plus voter.

Define required fields, valid values, foreign-key deletion behavior, and uniqueness in migrations. In particular, enforce one vote per member per item in the database. Do not rely on client-side validation for data integrity.

### Database and Storage security

- Enable RLS on every exposed application table. Start with deny-by-default policies and grant only the operations required by each role.
- Check both existing rows and proposed row values for writes. Test unauthenticated access, same-group access, cross-group access, pending applicants, and removed members.
- Do not treat RLS as the only security control. Use authenticated sessions, input validation, least privilege, and secure server-side handling for privileged operations.
- The Supabase anon key is expected to be present in the browser; the service-role key must never be sent to or bundled in client code.
- Keep the photo bucket private. Store object paths, not public or long-lived signed URLs, in the database. Authorize Storage reads and writes against the user's current group membership and the object's group path.
- Allow uploads only for approved group members. Limit deletion to the uploader or group owner, subject to retention and group-deletion rules.
- Create short-lived signed URLs only after authorization. Treat them as bearer credentials and do not log them.
- Use the Supabase Storage API to upload and delete files. Do not modify Storage metadata tables directly.
- Keep membership approval, invitation redemption, account deletion, and other multi-step privileged actions in trusted server-side code or carefully restricted database functions. Make operations atomic where possible and safe to retry where they span Storage and PostgreSQL.

### Input and browser security

- Re-encode images and remove EXIF metadata before upload. If metadata removal is a privacy promise, verify it in trusted processing code rather than relying only on a client check. Configure Storage limits for allowed file types and maximum size; browser checks are for user experience, not authorization.
- Treat Realtime as a delivery mechanism, not an authorization boundary or source of truth. Subscriptions must be scoped to data the signed-in user may read; refetch through authorized queries after relevant events.
- Escape user-provided text through normal framework rendering. Do not render untrusted HTML.
- Serve the production app over HTTPS. Set a Content Security Policy that matches the built app; avoid unsafe script execution and review any exception required by the framework.
- Do not add analytics or tracking by default. Any later addition needs a privacy review and clear disclosure.

## Privacy, retention, and account lifecycle

Photos, names, votes, and group membership are personal data. Collect only what the app needs and explain the use, access, and retention of that data before launch.

Do not describe the product as GDPR-compliant based only on this guide, a consent checkbox, or an EU hosting region. Before launch, verify the applicable lawful basis, privacy notice, processor terms, data location, user-rights process, and retention policy. A privacy notice is not a substitute for a lawful basis.

### Photo retention

The product default is to delete each photo two years after upload, unless the uploader deletes it sooner.

- Set and display the retention deadline when the photo is uploaded.
- Show the uploader an in-app notice 30 days before deletion.
- Run cleanup from trusted scheduled code. Delete files through the Storage API, then remove related votes and the database record.
- Make cleanup idempotent and retry partial failures. Do not report deletion as complete while the Storage object remains.
- Use one retention deadline as the source of truth. Do not mix age-based criteria with a separate status that has no scheduled transition.

If the product changes this retention period, update the user-facing policy and implementation together.

### Account deletion and export

- Require a recent authenticated session before accepting an account deletion request.
- Perform privileged Auth administration only in trusted server-side code. Never expose admin credentials or delete rows from Supabase Auth tables directly.
- Before deleting a group owner, require ownership transfer or an explicit group deletion decision.
- Delete a user's photos through the Storage API and remove their votes, profile, memberships, and other associated records according to the documented group policy.
- Make deletion resumable and safe to retry if Storage or database operations fail. Confirm completion only after all required data is removed.
- Provide a machine-readable export of the requesting user's profile, votes, and memberships, plus the photo files and associated metadata. Authorize and protect the export like other private data.

Do not promise that browser data can be remotely erased. The MVP avoids persisting private photos and API data in browser caches.

## Internationalization and accessibility

- French is the default language; English is also supported.
- Put all user-facing strings, validation messages, empty states, and accessibility labels in translation resources.
- Detect the browser language on first use only when it is supported; otherwise use French. Persist the user's selected language.
- Format dates and numbers with the active locale. Use the i18n library's pluralization rules.
- Build mobile-first layouts with semantic controls, keyboard access, visible focus, and labels for form fields and image actions.

## Cost and operations

Provider plans and limits change. Check current pricing and terms before deployment; do not hard-code vendor quota claims or describe the service as guaranteed to cost zero.

Set practical upload and request limits, monitor storage and bandwidth, and configure budget or usage alerts where available. Explain any limits to users. Choose a region based on user needs and provider capabilities; region selection alone does not establish legal compliance.

## Development and review

- Inspect the existing project before scaffolding or changing its structure. Add only what the MVP needs.
- Keep schema changes in migrations and review them for data loss and rollback implications.
- Use real Supabase user sessions in the app. Never place privileged database operations in client code.
- For changes to authentication, RLS, invitations, Storage, retention, or deletion, review the authorization boundary and failure cases explicitly.
- Add tests for vote constraints, invitation lifecycle, account boundaries, and deletion retries as those features are implemented. Run the repository's relevant checks before describing a change as verified.
- Report security assumptions and unresolved risks plainly. A checklist or review is not a guarantee of security or legal compliance.

## Commit messages

Start commit subjects with a relevant gitmoji, followed by a concise imperative summary. Examples:

- 🔒 Restrict photo access to group members
- ✨ Add group invitation requests
- 📝 Clarify photo retention behavior

## Deferred ideas

Consider push notifications, offline support, item claims, categories, search, comments, and dark mode only after the MVP is in use and the privacy, cost, and maintenance impact is understood.

