-- Account tiers. Every account starts as "free" with strict limits; the backend administrator
-- grants "premium" with set_account_tier(), which only the service role can execute. Nothing a
-- client (or a forked frontend) can call changes a tier, and every limit is enforced here.

create type public.account_tier as enum ('free', 'premium');

alter table public.profiles
  add column tier public.account_tier not null default 'free',
  add column tier_granted_at timestamptz,
  add column tier_note text check (char_length(tier_note) <= 200);

-- Clients may insert or update their profile, but never touch the tier columns.
create or replace function public.profiles_protect_tier()
returns trigger language plpgsql as $$
begin
  -- auth.uid() is null for the service role and for the postgres superuser (migrations, admin).
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.tier := 'free';
      new.tier_granted_at := null;
      new.tier_note := null;
    elsif new.tier is distinct from old.tier
       or new.tier_granted_at is distinct from old.tier_granted_at
       or new.tier_note is distinct from old.tier_note then
      raise exception 'tier can only be changed by the administrator' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_protect_tier before insert or update on public.profiles
  for each row execute function public.profiles_protect_tier();

-- ---------------------------------------------------------------------------
-- Limits per tier. Change them here (new migration) and in the README together.
-- ---------------------------------------------------------------------------
create or replace function public.tier_limit(p_tier public.account_tier, p_name text)
returns integer
language sql immutable as $$
  select case p_name
    when 'owned_groups'       then case p_tier when 'free' then 1  else 20  end
    when 'group_members'      then case p_tier when 'free' then 5  else 50  end
    when 'photos'             then case p_tier when 'free' then 10 else 500 end
    when 'active_invitations' then case p_tier when 'free' then 3  else 50  end
  end;
$$;

create or replace function public.account_tier_of(p_user_id uuid)
returns public.account_tier
language sql stable security definer set search_path = public as $$
  select coalesce((select tier from public.profiles where id = p_user_id), 'free');
$$;
revoke all on function public.account_tier_of(uuid) from public;
grant execute on function public.account_tier_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforcement
-- ---------------------------------------------------------------------------

-- Owned groups: checked in create_group.
create or replace function public.create_group(p_name text)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  g public.groups;
  owned integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile required' using errcode = '42501';
  end if;
  select count(*) into owned from public.groups where owner_id = uid;
  if owned >= public.tier_limit(public.account_tier_of(uid), 'owned_groups') then
    raise exception 'group limit reached for this account' using errcode = 'P0010';
  end if;
  insert into public.groups (name, owner_id) values (btrim(p_name), uid) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  insert into public.group_feed_state (group_id) values (g.id);
  return g;
end;
$$;

-- Active invitation links per group: checked in create_invitation (owner's tier).
create or replace function public.create_invitation(p_group_id uuid)
returns table (id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  raw bytea;
  tok text;
  inv public.invitations;
  active integer;
begin
  if uid is null or not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can create invitations' using errcode = '42501';
  end if;
  select count(*) into active from public.invitations i
  where i.group_id = p_group_id and i.revoked_at is null and i.redeemed_at is null and i.expires_at > now();
  if active >= public.tier_limit(public.account_tier_of(uid), 'active_invitations') then
    raise exception 'invitation limit reached for this account' using errcode = 'P0011';
  end if;
  raw := extensions.gen_random_bytes(32);
  tok := replace(replace(rtrim(encode(raw, 'base64'), '='), '+', '-'), '/', '_');
  insert into public.invitations (group_id, created_by, token_hash, expires_at)
  values (p_group_id, uid, encode(extensions.digest(tok, 'sha256'), 'hex'), now() + interval '24 hours')
  returning * into inv;
  return query select inv.id, tok, inv.expires_at;
end;
$$;

-- Members per group: checked when a request is approved (owner's tier).
create or replace function public.review_membership_request(p_request_id uuid, p_approve boolean)
returns public.membership_requests
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  req public.membership_requests;
  members integer;
begin
  select * into req from public.membership_requests where id = p_request_id for update;
  if req.id is null or uid is null or not public.is_group_owner(req.group_id) then
    raise exception 'only the group owner can review requests' using errcode = '42501';
  end if;
  if req.status <> 'pending' then
    raise exception 'request already reviewed' using errcode = 'P0003';
  end if;
  if p_approve then
    select count(*) into members from public.group_members where group_id = req.group_id;
    if members >= public.tier_limit(public.account_tier_of(uid), 'group_members') then
      raise exception 'member limit reached for this group' using errcode = 'P0012';
    end if;
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

-- Photos per uploader: trigger, so the Edge Function insert is covered too.
create or replace function public.clothing_items_enforce_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owned integer;
begin
  select count(*) into owned from public.clothing_items where uploader_id = new.uploader_id;
  if owned >= public.tier_limit(public.account_tier_of(new.uploader_id), 'photos') then
    raise exception 'photo limit reached for this account' using errcode = 'P0013';
  end if;
  return new;
end;
$$;
create trigger clothing_items_enforce_limit before insert on public.clothing_items
  for each row execute function public.clothing_items_enforce_limit();

-- Ownership transfer must not hand a group to someone whose tier cannot hold it.
create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  owned integer;
  members integer;
  new_tier public.account_tier;
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
  new_tier := public.account_tier_of(p_new_owner);
  select count(*) into owned from public.groups where owner_id = p_new_owner;
  if owned >= public.tier_limit(new_tier, 'owned_groups') then
    raise exception 'group limit reached for the new owner' using errcode = 'P0010';
  end if;
  select count(*) into members from public.group_members where group_id = p_group_id;
  if members > public.tier_limit(new_tier, 'group_members') then
    raise exception 'member limit of the new owner is below the group size' using errcode = 'P0012';
  end if;
  update public.group_members set role = 'member' where group_id = p_group_id and user_id = uid;
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
  update public.groups set owner_id = p_new_owner where id = p_group_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the account page shows: tier, limits and current usage of the caller.
-- ---------------------------------------------------------------------------
create or replace function public.my_entitlements()
returns table (
  tier public.account_tier,
  owned_groups integer, owned_groups_limit integer,
  photos integer, photos_limit integer,
  group_members_limit integer,
  active_invitations_limit integer
)
language sql stable security definer set search_path = public as $$
  with me as (select public.account_tier_of(auth.uid()) as tier)
  select me.tier,
         (select count(*)::integer from public.groups where owner_id = auth.uid()),
         public.tier_limit(me.tier, 'owned_groups'),
         (select count(*)::integer from public.clothing_items where uploader_id = auth.uid()),
         public.tier_limit(me.tier, 'photos'),
         public.tier_limit(me.tier, 'group_members'),
         public.tier_limit(me.tier, 'active_invitations')
  from me
  where auth.uid() is not null;
$$;
revoke all on function public.my_entitlements() from public;
grant execute on function public.my_entitlements() to authenticated;

-- Member capacity of a group, for members (depends on the owner's tier).
create or replace function public.group_member_limit(p_group_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select public.tier_limit(public.account_tier_of(g.owner_id), 'group_members')
  from public.groups g
  where g.id = p_group_id and public.is_group_member(p_group_id);
$$;
revoke all on function public.group_member_limit(uuid) from public;
grant execute on function public.group_member_limit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Administration. Only the service role / database owner can run this:
--   select public.set_account_tier('friend@example.com', 'premium', 'close friend');
-- ---------------------------------------------------------------------------
create or replace function public.set_account_tier(p_email text, p_tier public.account_tier, p_note text default null)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  p public.profiles;
begin
  if auth.uid() is not null then
    raise exception 'administrator only' using errcode = '42501';
  end if;
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'no account with this email' using errcode = 'P0002';
  end if;
  update public.profiles
  set tier = p_tier,
      tier_granted_at = case when p_tier = 'free' then null else now() end,
      tier_note = case when p_tier = 'free' then null else p_note end
  where id = uid
  returning * into p;
  if p.id is null then
    raise exception 'this account has not completed onboarding yet' using errcode = 'P0002';
  end if;
  return p;
end;
$$;
revoke all on function public.set_account_tier(text, public.account_tier, text) from public, anon, authenticated;
grant execute on function public.set_account_tier(text, public.account_tier, text) to service_role;
