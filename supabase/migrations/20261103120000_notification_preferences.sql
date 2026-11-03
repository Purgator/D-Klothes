-- Notification preferences: kinds a user does not want (account page) and groups a member
-- muted (group settings), both checked by the triggers before a row is created. Withdrawing
-- an "I want this" vote settles the uploader's notification.

alter table public.profiles add column muted_kinds public.notification_kind[] not null default '{}';
alter table public.group_members add column muted boolean not null default false;

-- A member may mute or unmute a group for themselves; the column grant keeps role and
-- group untouchable even though the policy allows the row update.
create policy group_members_update_own_mute on public.group_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (muted) on table public.group_members to authenticated;
-- Belt and braces: whatever the table grants are, a direct client update only ever changes
-- `muted`. Security definer RPCs (ownership transfer) run as their owner and are unaffected.
create or replace function public.group_members_protect()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.role is distinct from old.role
    or new.group_id is distinct from old.group_id
    or new.user_id is distinct from old.user_id
    or new.joined_at is distinct from old.joined_at
  ) then
    raise exception 'only the mute flag can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger group_members_protect before update on public.group_members
  for each row execute function public.group_members_protect();

create or replace function public.wants_notification(p_user uuid, p_kind public.notification_kind, p_group uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles p where p.id = p_user and p_kind = any (p.muted_kinds))
     and not exists (select 1 from public.group_members gm where gm.user_id = p_user and gm.group_id = p_group and gm.muted);
$$;
revoke all on function public.wants_notification(uuid, public.notification_kind, uuid) from public;

create or replace function public.notify_membership_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_op = 'INSERT' then
    select owner_id into owner from public.groups where id = new.group_id;
    if public.wants_notification(owner, 'membership_requested', new.group_id) then
      insert into public.notifications (user_id, kind, group_id, request_id, actor_id)
      values (owner, 'membership_requested', new.group_id, new.id, new.user_id);
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    if public.wants_notification(new.user_id,
         case when new.status = 'approved' then 'request_approved'::public.notification_kind
              else 'request_rejected'::public.notification_kind end, new.group_id) then
      insert into public.notifications (user_id, kind, group_id, request_id, actor_id)
      values (new.user_id,
              case when new.status = 'approved' then 'request_approved'::public.notification_kind
                   else 'request_rejected'::public.notification_kind end,
              new.group_id, new.id, new.reviewed_by);
    end if;
    update public.notifications set read_at = coalesce(read_at, now())
    where request_id = new.id and kind = 'membership_requested';
  end if;
  return null;
end;
$$;

create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' then
    insert into public.notifications (user_id, kind, group_id, actor_id)
    select gm.user_id, 'member_joined', new.group_id, new.user_id
    from public.group_members gm
    where gm.group_id = new.group_id and gm.user_id <> new.user_id
      and public.wants_notification(gm.user_id, 'member_joined', new.group_id);
  end if;
  return null;
end;
$$;

create or replace function public.notify_item_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, group_id, item_id, actor_id)
  select gm.user_id, 'item_added', new.group_id, new.id, new.uploader_id
  from public.group_members gm
  where gm.group_id = new.group_id and gm.user_id <> new.uploader_id
    and public.wants_notification(gm.user_id, 'item_added', new.group_id);
  return null;
end;
$$;

create or replace function public.notify_item_wanted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item public.clothing_items;
begin
  if new.vote = 'want' and (tg_op = 'INSERT' or old.vote <> 'want') then
    select * into item from public.clothing_items where id = new.item_id;
    if public.wants_notification(item.uploader_id, 'item_wanted', item.group_id) then
      -- One row per person per item: a renewed interest refreshes it instead of adding one.
      update public.notifications set read_at = null, created_at = now()
      where kind = 'item_wanted' and item_id = item.id and actor_id = new.voter_id;
      if not found then
        insert into public.notifications (user_id, kind, group_id, item_id, actor_id)
        values (item.uploader_id, 'item_wanted', item.group_id, item.id, new.voter_id);
      end if;
    end if;
  end if;
  return null;
end;
$$;

-- Withdrawing "I want this" (vote removed or changed) settles the uploader's notification.
create or replace function public.settle_item_wanted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.vote = 'want' and (tg_op = 'DELETE' or new.vote <> 'want') then
    update public.notifications set read_at = coalesce(read_at, now())
    where kind = 'item_wanted' and item_id = old.item_id and actor_id = old.voter_id;
  end if;
  return null;
end;
$$;
create trigger votes_settle_wanted after delete or update on public.votes
  for each row execute function public.settle_item_wanted();
