-- Explicit table privileges for the API roles. The local stack grants these by default,
-- hosted projects do not necessarily: without them every request fails with 42501 before
-- row-level security is even consulted. Grants are the minimum each policy set needs;
-- RLS still decides which rows. anon gets nothing: unauthenticated users only call
-- invitation_preview(), which is a security definer function.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on table public.profiles to authenticated;
grant select, update on table public.groups to authenticated;
grant select, delete on table public.group_members to authenticated;
grant select on table public.invitations to authenticated;
grant select on table public.membership_requests to authenticated;
grant select, update on table public.clothing_items to authenticated;
grant select, delete on table public.votes to authenticated;
grant select on table public.group_feed_state to authenticated;

-- Edge Functions use the service role for privileged writes.
grant all on all tables in schema public to service_role;
