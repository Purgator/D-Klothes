-- Ownership changes hands only when the receiving member agrees.
--
-- Until now transfer_group_ownership() made a member the owner on the spot. Owning a group
-- carries duties (reviewing requests, removing members, an account that cannot be deleted
-- while it owns a group) and uses one of the few groups a plan allows: nobody should receive
-- that without being asked. The owner now makes an offer, the member accepts or declines,
-- and the owner can withdraw it in the meantime.

-- ---------------------------------------------------------------------------
-- One pending offer per group
-- ---------------------------------------------------------------------------
create table public.ownership_offers (
  group_id uuid primary key references public.groups (id) on delete cascade,
  to_user uuid not null,
  created_at timestamptz not null default now(),
  -- The offer disappears when the member leaves, is removed or deletes their account.
  foreign key (group_id, to_user) references public.group_members (group_id, user_id) on delete cascade
);
create index ownership_offers_to_user_idx on public.ownership_offers (to_user);

alter table public.ownership_offers enable row level security;
create policy ownership_offers_select_parties on public.ownership_offers for select to authenticated
  using (to_user = auth.uid() or public.is_group_owner(group_id));
-- Read only: every write goes through the functions below.
grant select on table public.ownership_offers to authenticated;
grant all on table public.ownership_offers to service_role;

-- However an offer ends (answer, withdrawal, member gone), its notification is settled.
create function public.settle_ownership_offer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
  where kind = 'ownership_offered' and group_id = old.group_id and user_id = old.to_user;
  return null;
end;
$$;
create trigger ownership_offers_settle after delete on public.ownership_offers
  for each row execute function public.settle_ownership_offer();

-- ---------------------------------------------------------------------------
-- Offer, withdraw, answer
-- ---------------------------------------------------------------------------
-- The receiving account must be able to hold the group. Checked when the offer is made (so
-- the owner knows at once) and again when it is accepted (plans and group sizes change).
create function public.assert_can_own_group(p_group_id uuid, p_user uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  tier public.account_tier := public.account_tier_of(p_user);
  owned integer;
  members integer;
begin
  select count(*) into owned from public.groups where owner_id = p_user;
  if owned >= public.tier_limit(tier, 'owned_groups') then
    raise exception 'group limit reached for the new owner' using errcode = 'P0010';
  end if;
  select count(*) into members from public.group_members where group_id = p_group_id;
  if members > public.tier_limit(tier, 'group_members') then
    raise exception 'member limit of the new owner is below the group size' using errcode = 'P0012';
  end if;
end;
$$;

create function public.offer_group_ownership(p_group_id uuid, p_to_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can offer ownership' using errcode = '42501';
  end if;
  if p_to_user is null or p_to_user = uid
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'new owner must be another member' using errcode = 'P0004';
  end if;
  perform public.assert_can_own_group(p_group_id, p_to_user);
  -- A new offer replaces the pending one.
  delete from public.ownership_offers where group_id = p_group_id;
  insert into public.ownership_offers (group_id, to_user) values (p_group_id, p_to_user);
  insert into public.notifications (user_id, kind, group_id, actor_id)
  values (p_to_user, 'ownership_offered', p_group_id, uid);
end;
$$;

create function public.cancel_ownership_offer(p_group_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_group_owner(p_group_id) then
    raise exception 'only the group owner can withdraw an offer' using errcode = '42501';
  end if;
  delete from public.ownership_offers where group_id = p_group_id;
end;
$$;

create function public.respond_ownership_offer(p_group_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  previous_owner uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Lock the group so two answers, or an answer and a withdrawal, cannot interleave.
  select owner_id into previous_owner from public.groups where id = p_group_id for update;
  if not exists (select 1 from public.ownership_offers where group_id = p_group_id and to_user = uid) then
    raise exception 'no ownership offer to answer' using errcode = 'P0015';
  end if;
  if coalesce(p_accept, false) then
    perform public.assert_can_own_group(p_group_id, uid);
    update public.group_members set role = 'member' where group_id = p_group_id and user_id = previous_owner;
    update public.group_members set role = 'owner' where group_id = p_group_id and user_id = uid;
    update public.groups set owner_id = uid where id = p_group_id;
  end if;
  delete from public.ownership_offers where group_id = p_group_id;
  insert into public.notifications (user_id, kind, group_id, actor_id)
  values (previous_owner,
          case when coalesce(p_accept, false) then 'ownership_accepted'::public.notification_kind
               else 'ownership_declined'::public.notification_kind end,
          p_group_id, uid);
end;
$$;

-- The one-sided transfer is gone.
drop function public.transfer_group_ownership(uuid, uuid);

revoke execute on function
  public.settle_ownership_offer(),
  public.assert_can_own_group(uuid, uuid),
  public.offer_group_ownership(uuid, uuid),
  public.cancel_ownership_offer(uuid),
  public.respond_ownership_offer(uuid, boolean)
from public, anon, authenticated;
grant execute on function
  public.offer_group_ownership(uuid, uuid),
  public.cancel_ownership_offer(uuid),
  public.respond_ownership_offer(uuid, boolean)
to authenticated;

-- ---------------------------------------------------------------------------
-- Who uploaded a photo is for the group's members only
-- ---------------------------------------------------------------------------
-- item_uploader_id() answered for any photo id, to any signed-in user. The one policy that
-- used it only needs a yes or no about the caller, which tells nothing about anyone else.
create function public.is_item_uploader(p_item_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clothing_items ci
    where ci.id = p_item_id and ci.uploader_id = auth.uid()
  );
$$;
revoke execute on function public.is_item_uploader(uuid) from public, anon;
grant execute on function public.is_item_uploader(uuid) to authenticated;

drop policy votes_select_want_for_uploader on public.votes;
create policy votes_select_want_for_uploader on public.votes for select to authenticated
  using (vote = 'want' and public.is_item_uploader(item_id));

revoke execute on function public.item_uploader_id(uuid) from public, anon, authenticated;
