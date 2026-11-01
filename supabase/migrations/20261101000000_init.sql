-- D-Klothes initial schema.
-- Deny-by-default: every table has RLS enabled and only the policies below grant access.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.membership_role as enum ('owner', 'member');
create type public.request_status as enum ('pending', 'approved', 'rejected');
create type public.vote_type as enum ('keep', 'let_go', 'want');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Deleting an owner's profile is refused until ownership is transferred or the group deleted.
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index groups_owner_id_idx on public.groups (owner_id);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);
-- Exactly one owner row per group.
create unique index group_members_one_owner_idx on public.group_members (group_id) where role = 'owner';

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- sha256 of the raw token, hex encoded. The raw token is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,
  check (expires_at > created_at)
);
create index invitations_group_id_idx on public.invitations (group_id);

create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invitation_id uuid references public.invitations (id) on delete set null,
  message text not null default '' check (char_length(message) <= 280),
  status public.request_status not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  check ((status = 'pending') = (reviewed_at is null))
);
create index membership_requests_group_status_idx on public.membership_requests (group_id, status);
create index membership_requests_user_id_idx on public.membership_requests (user_id);
-- One pending request per applicant per group.
create unique index membership_requests_one_pending_idx
  on public.membership_requests (group_id, user_id) where status = 'pending';

create table public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  -- Path inside the private "photos" bucket: <group_id>/<uploader_id>/<file>.jpg
  storage_path text not null unique check (char_length(storage_path) between 1 and 512),
  title text not null default '' check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  -- Single source of truth for photo retention (default: two years after upload).
  retention_deadline timestamptz not null default (now() + interval '2 years'),
  check (retention_deadline > created_at)
);
create index clothing_items_group_created_idx on public.clothing_items (group_id, created_at desc);
create index clothing_items_uploader_idx on public.clothing_items (uploader_id);
create index clothing_items_retention_idx on public.clothing_items (retention_deadline);

create table public.votes (
  item_id uuid not null references public.clothing_items (id) on delete cascade,
  voter_id uuid not null references public.profiles (id) on delete cascade,
  vote public.vote_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One vote per member per item, enforced here and not only in the UI.
  primary key (item_id, voter_id)
);
create index votes_voter_id_idx on public.votes (voter_id);

-- One row per group, bumped by triggers so Realtime clients know when to refetch.
-- It carries no private content: only a version counter.
create table public.group_feed_state (
  group_id uuid primary key references public.groups (id) on delete cascade,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can consult membership
-- without recursing into RLS). All of them are STABLE and read-only.
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  );
$$;

create or replace function public.item_group_id(p_item_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select group_id from public.clothing_items where id = p_item_id;
$$;

create or replace function public.item_uploader_id(p_item_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$
  select uploader_id from public.clothing_items where id = p_item_id;
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.shares_group_with(uuid) from public;
revoke all on function public.item_group_id(uuid) from public;
revoke all on function public.item_uploader_id(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
grant execute on function public.item_group_id(uuid) to authenticated;
grant execute on function public.item_uploader_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger votes_set_updated_at before update on public.votes
  for each row execute function public.set_updated_at();

-- Votes are advice on an item, so the vote target cannot be changed afterwards.
create or replace function public.votes_prevent_rekey()
returns trigger language plpgsql as $$
begin
  if new.item_id <> old.item_id or new.voter_id <> old.voter_id then
    raise exception 'vote identity cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger votes_prevent_rekey before update on public.votes
  for each row execute function public.votes_prevent_rekey();

create or replace function public.bump_group_feed_state()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if tg_table_name = 'clothing_items' then
    gid := coalesce(new.group_id, old.group_id);
  elsif tg_table_name = 'votes' then
    gid := public.item_group_id(coalesce(new.item_id, old.item_id));
  end if;
  if gid is not null then
    insert into public.group_feed_state (group_id, version, updated_at)
    values (gid, 1, now())
    on conflict (group_id) do update
      set version = public.group_feed_state.version + 1, updated_at = now();
  end if;
  return null;
end;
$$;
create trigger clothing_items_bump_feed after insert or update or delete on public.clothing_items
  for each row execute function public.bump_group_feed_state();
create trigger votes_bump_feed after insert or update or delete on public.votes
  for each row execute function public.bump_group_feed_state();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invitations enable row level security;
alter table public.membership_requests enable row level security;
alter table public.clothing_items enable row level security;
alter table public.votes enable row level security;
alter table public.group_feed_state enable row level security;

-- profiles: own row read/write; co-members can read display names.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_comember on public.profiles for select to authenticated
  using (public.shares_group_with(id));
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Deletion goes through the trusted account-deletion function (service role).

-- groups: members read; creation/transfer/deletion via RPC or trusted code.
create policy groups_select_member on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update_owner_name on public.groups for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- group_members: members read the roster; a member may leave; the owner may remove members.
create policy group_members_select_member on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_delete_self on public.group_members for delete to authenticated
  using (user_id = auth.uid() and role = 'member');
create policy group_members_delete_by_owner on public.group_members for delete to authenticated
  using (public.is_group_owner(group_id) and role = 'member');

-- invitations: owner reads metadata (never the raw token, which is not stored).
create policy invitations_select_owner on public.invitations for select to authenticated
  using (public.is_group_owner(group_id));

-- membership_requests: applicant reads own; owner reads the group's. Writes via RPC.
create policy membership_requests_select_own on public.membership_requests for select to authenticated
  using (user_id = auth.uid());
create policy membership_requests_select_owner on public.membership_requests for select to authenticated
  using (public.is_group_owner(group_id));

-- clothing_items: members read; uploads are registered by trusted code after verification;
-- the uploader may edit the title. Deletion goes through trusted code (Storage first).
create policy clothing_items_select_member on public.clothing_items for select to authenticated
  using (public.is_group_member(group_id));
create policy clothing_items_update_uploader on public.clothing_items for update to authenticated
  using (uploader_id = auth.uid())
  with check (
    uploader_id = auth.uid()
    and public.is_group_member(group_id)
  );

-- votes: a voter sees their own vote; the uploader sees who wants their item.
-- Keep / Let go choices of others are never readable; aggregates come from an RPC.
create policy votes_select_own on public.votes for select to authenticated
  using (voter_id = auth.uid());
create policy votes_select_want_for_uploader on public.votes for select to authenticated
  using (vote = 'want' and public.item_uploader_id(item_id) = auth.uid());
create policy votes_delete_own on public.votes for delete to authenticated
  using (voter_id = auth.uid());
-- Insert/update go through cast_vote(), which checks membership and ownership.

-- group_feed_state: members may read (needed for Realtime delivery). No client writes.
create policy group_feed_state_select_member on public.group_feed_state for select to authenticated
  using (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER, authorization checked explicitly against auth.uid()).
-- ---------------------------------------------------------------------------

create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  insert into public.groups (name, owner_id) values (btrim(p_name), uid) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  insert into public.group_feed_state (group_id) values (g.id);
  return g;
end;
$$;

-- Returns the raw token exactly once. Only its sha256 hash is stored.
create or replace function public.create_invitation(p_group_id uuid)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  raw bytea;
  tok text;
  inv public.invitations;
begin
  if uid is null or not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can create invitations' using errcode = '42501';
  end if;
  raw := extensions.gen_random_bytes(32);
  -- base64url without padding, 43 characters.
  tok := replace(replace(rtrim(encode(raw, 'base64'), '='), '+', '-'), '/', '_');
  insert into public.invitations (group_id, created_by, token_hash, expires_at)
  values (p_group_id, uid, encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '24 hours')
  returning * into inv;
  return query select inv.id, tok, inv.expires_at;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  select group_id into gid from public.invitations where id = p_invitation_id;
  if gid is null or not public.is_group_owner(gid) then
    raise exception 'only the group owner can revoke invitations' using errcode = '42501';
  end if;
  update public.invitations set revoked_at = coalesce(revoked_at, now())
  where id = p_invitation_id and redeemed_at is null;
end;
$$;

-- Unauthenticated preview: group name and validity only. No members, no content.
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
  if inv.id is null then
    return query select null::text, false;
    return;
  end if;
  select name into gname from public.groups where id = inv.group_id;
  return query select
    gname,
    (inv.revoked_at is null and inv.redeemed_at is null and inv.expires_at > now());
end;
$$;

-- Atomic redemption: locks the invitation row, consumes it and creates one pending request.
create or replace function public.redeem_invitation(p_token text, p_message text default '')
returns public.membership_requests
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  inv public.invitations;
  req public.membership_requests;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) <> 43 then
    raise exception 'invalid invitation' using errcode = 'P0002';
  end if;
  select * into inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;
  if inv.id is null or inv.revoked_at is not null or inv.redeemed_at is not null or inv.expires_at <= now() then
    raise exception 'invalid invitation' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = inv.group_id and user_id = uid) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  if exists (select 1 from public.membership_requests
             where group_id = inv.group_id and user_id = uid and status = 'pending') then
    raise exception 'request already pending' using errcode = '23505';
  end if;
  update public.invitations set redeemed_at = now(), redeemed_by = uid where id = inv.id;
  insert into public.membership_requests (group_id, user_id, invitation_id, message)
  values (inv.group_id, uid, inv.id, left(coalesce(p_message, ''), 280))
  returning * into req;
  return req;
end;
$$;

create or replace function public.review_membership_request(p_request_id uuid, p_approve boolean)
returns public.membership_requests
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  req public.membership_requests;
begin
  select * into req from public.membership_requests where id = p_request_id for update;
  if req.id is null or uid is null or not public.is_group_owner(req.group_id) then
    raise exception 'only the group owner can review requests' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    raise exception 'request already reviewed' using errcode = 'P0003';
  end if;
  update public.membership_requests
  set status = case when p_approve then 'approved'::public.request_status else 'rejected'::public.request_status end,
      reviewed_by = uid, reviewed_at = now()
  where id = p_request_id returning * into req;
  if p_approve then
    insert into public.group_members (group_id, user_id, role)
    values (req.group_id, req.user_id, 'member')
    on conflict do nothing;
  end if;
  return req;
end;
$$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can transfer ownership' using errcode = '42501';
  end if;
  if p_new_owner = uid then
    return;
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner) then
    raise exception 'new owner must be a member' using errcode = 'P0004';
  end if;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;

-- Upsert the caller's vote. Members only; the uploader cannot vote on their own item.
create or replace function public.cast_vote(p_item_id uuid, p_vote public.vote_type)
returns public.votes
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  item public.clothing_items;
  v public.votes;
begin
  select * into item from public.clothing_items where id = p_item_id;
  if uid is null or item.id is null or not public.is_group_member(item.group_id) then
    raise exception 'not allowed to vote on this item' using errcode = '42501';
  end if;
  if item.uploader_id = uid then
    raise exception 'cannot vote on your own item' using errcode = '42501';
  end if;
  insert into public.votes (item_id, voter_id, vote) values (p_item_id, uid, p_vote)
  on conflict (item_id, voter_id) do update set vote = excluded.vote
  returning * into v;
  return v;
end;
$$;

-- Aggregate counts for a group's items, for members. Reveals no individual choice.
create or replace function public.group_vote_counts(p_group_id uuid)
returns table (item_id uuid, keep_count integer, let_go_count integer, want_count integer)
language sql stable security definer set search_path = public as $$
  select ci.id,
         count(v.*) filter (where v.vote = 'keep')::integer,
         count(v.*) filter (where v.vote = 'let_go')::integer,
         count(v.*) filter (where v.vote = 'want')::integer
  from public.clothing_items ci
  left join public.votes v on v.item_id = ci.id
  where ci.group_id = p_group_id and public.is_group_member(p_group_id)
  group by ci.id;
$$;

-- Items whose retention deadline is within 30 days, for the caller's own uploads.
create or replace function public.my_retention_notices()
returns setof public.clothing_items
language sql stable security definer set search_path = public as $$
  select * from public.clothing_items
  where uploader_id = auth.uid()
    and retention_deadline <= now() + interval '30 days'
  order by retention_deadline;
$$;

revoke all on function public.create_group(text) from public;
revoke all on function public.create_invitation(uuid) from public;
revoke all on function public.revoke_invitation(uuid) from public;
revoke all on function public.invitation_preview(text) from public;
revoke all on function public.redeem_invitation(text, text) from public;
revoke all on function public.review_membership_request(uuid, boolean) from public;
revoke all on function public.transfer_group_ownership(uuid, uuid) from public;
revoke all on function public.cast_vote(uuid, public.vote_type) from public;
revoke all on function public.group_vote_counts(uuid) from public;
revoke all on function public.my_retention_notices() from public;

grant execute on function public.create_group(text) to authenticated;
grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.redeem_invitation(text, text) to authenticated;
grant execute on function public.review_membership_request(uuid, boolean) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.cast_vote(uuid, public.vote_type) to authenticated;
grant execute on function public.group_vote_counts(uuid) to authenticated;
grant execute on function public.my_retention_notices() to authenticated;

-- Realtime: only the version table is published. Clients refetch through RLS-protected queries.
alter publication supabase_realtime add table public.group_feed_state;
