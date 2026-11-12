-- API privileges as a whitelist.
--
-- Until now the tables relied on row-level security alone. Supabase projects give the API
-- roles (anon, authenticated) every privilege on every new table and function of the public
-- schema by default, so the narrower grants written in earlier migrations added nothing: a
-- signed-in user could rewrite any column of a row a policy let them update. With a
-- hand-written request an uploader could repoint a photo record at another file, move it to
-- another group or push back its retention date, and anyone could rename themselves.
--
-- This migration takes everything away from the API roles and gives back exactly what the app
-- uses, column by column. Row-level security still decides which rows. Everything else goes
-- through security definer functions, which run as their owner and are not affected.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

-- profiles: a display name is chosen once, at creation. Other people see the name only; the
-- plan, its note and the notification preferences are read through my_profile(). A future
-- "change my name" feature belongs in a security definer function (rate limit, history).
grant select (id, display_name) on table public.profiles to authenticated;
grant insert (id, display_name) on table public.profiles to authenticated;
grant update (muted_kinds) on table public.profiles to authenticated;

-- groups: the owner renames the group and sets who may upload (policy groups_update_owner_name).
grant select on table public.groups to authenticated;
grant update (name, members_can_upload) on table public.groups to authenticated;

-- group_members: the roster is visible to members, the mute flag only to its owner
-- (my_group_mute()). A member mutes a group for themselves, leaves, or is removed by the owner.
grant select (group_id, user_id, role, joined_at) on table public.group_members to authenticated;
grant update (muted) on table public.group_members to authenticated;
grant delete on table public.group_members to authenticated;

grant select on table public.invitations to authenticated;
grant select on table public.membership_requests to authenticated;
grant select on table public.group_feed_state to authenticated;

-- clothing_items: the uploader edits the title, nothing else. The file path, the group, the
-- uploader and the retention deadline are set by trusted code when the photo is registered.
grant select on table public.clothing_items to authenticated;
grant update (title) on table public.clothing_items to authenticated;

-- votes: cast through cast_vote(); a voter withdraws their own vote.
grant select, delete on table public.votes to authenticated;

-- notifications: the recipient marks them read.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- A photo record always points inside its own group and uploader folder. Trusted code already
-- registers it that way; the constraint makes it an invariant for every later writer.
-- NOT VALID: enforced on every new or changed row without rescanning existing ones.
alter table public.clothing_items
  add constraint clothing_items_path_in_own_folder
  check (starts_with(storage_path, group_id::text || '/' || uploader_id::text || '/')) not valid;

-- ---------------------------------------------------------------------------
-- Reading one's own private columns
-- ---------------------------------------------------------------------------
create function public.my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;

create function public.my_group_mute(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select gm.muted from public.group_members gm where gm.group_id = p_group_id and gm.user_id = auth.uid()),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Functions that said a little too much
-- ---------------------------------------------------------------------------
-- An expired, revoked or used invitation link no longer reveals the group's (current) name.
create or replace function public.invitation_preview(p_token text)
returns table (group_name text, valid boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  inv public.invitations;
  gname text;
begin
  if p_token is null or char_length(p_token) <> 43 then
    return query select null::text, false;
    return;
  end if;
  select * into inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if inv.id is null or inv.revoked_at is not null or inv.redeemed_at is not null or inv.expires_at <= now() then
    return query select null::text, false;
    return;
  end if;
  select name into gname from public.groups where id = inv.group_id;
  return query select gname, true;
end;
$$;

-- Notifications resolve names at read time. Someone who has left a group keeps their old
-- notifications but no longer learns its current name, item titles or member names from them.
-- The answer to one's own membership request still names the group (never the reviewer), and
-- an owner still sees the name of an applicant.
create or replace function public.my_notifications(p_limit integer default 100)
returns table (
  id uuid,
  kind public.notification_kind,
  created_at timestamptz,
  read_at timestamptz,
  group_id uuid,
  group_name text,
  item_id uuid,
  item_title text,
  request_id uuid,
  actor_name text
)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.created_at, n.read_at,
         n.group_id, g.name,
         n.item_id, ci.title,
         n.request_id,
         p.display_name
  from public.notifications n
  left join public.groups g
    on g.id = n.group_id
   and (n.kind in ('request_approved', 'request_rejected') or public.is_group_member(g.id))
  left join public.clothing_items ci
    on ci.id = n.item_id and public.is_group_member(ci.group_id)
  left join public.profiles p
    on p.id = n.actor_id
   and n.kind not in ('request_approved', 'request_rejected')
   and (public.shares_group_with(p.id)
        or (n.kind = 'membership_requested' and public.is_group_owner(n.group_id)))
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
-- Same whitelist. Internal helpers (tier lookups, notification preferences, the retention
-- job, trigger functions) are only ever called by security definer code or the scheduler.
revoke execute on all functions in schema public from public, anon, authenticated;

-- The invitation page works before sign-in.
grant execute on function public.invitation_preview(text) to anon, authenticated;

grant execute on function
  -- used by row-level security and Storage policies
  public.is_group_member(uuid),
  public.is_group_owner(uuid),
  public.shares_group_with(uuid),
  public.item_uploader_id(uuid),
  public.photo_path_group(text),
  public.photo_path_uploader(text),
  public.can_upload_to_group(uuid),
  -- called by the app
  public.create_group(text, boolean),
  public.create_invitation(uuid),
  public.revoke_invitation(uuid),
  public.redeem_invitation(text, text),
  public.review_membership_request(uuid, boolean),
  public.transfer_group_ownership(uuid, uuid),
  public.group_member_limit(uuid),
  public.cast_vote(uuid, public.vote_type),
  public.group_vote_counts(uuid),
  public.my_profile(),
  public.my_group_mute(uuid),
  public.my_entitlements(),
  public.my_membership_requests(),
  public.my_retention_notices(),
  public.my_notifications(integer),
  public.mark_notifications_read(uuid[])
to authenticated;

-- ---------------------------------------------------------------------------
-- From now on
-- ---------------------------------------------------------------------------
-- New tables and functions created by migrations start with nothing for the API roles: each
-- migration grants what its feature needs. (Functions still get EXECUTE for PUBLIC from
-- PostgreSQL itself: keep revoking it explicitly.)
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
