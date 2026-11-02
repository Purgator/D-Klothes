-- In-app notifications, created by triggers on the events members care about.
-- Rows are private to their recipient; the only client write is marking them read.

create type public.notification_kind as enum (
  'membership_requested',  -- to the owner: someone applied to their group
  'request_approved',      -- to the applicant
  'request_rejected',      -- to the applicant
  'member_joined',         -- to the other members: a new member was approved
  'item_added',            -- to the other members: a new photo
  'item_wanted'            -- to the uploader: someone chose "I want this"
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  group_id uuid references public.groups (id) on delete cascade,
  item_id uuid references public.clothing_items (id) on delete cascade,
  request_id uuid references public.membership_requests (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Column-level grant: clients can only ever change read_at.
grant select on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Owners must be able to see who is applying, before approval.
-- ---------------------------------------------------------------------------
create policy profiles_select_applicant_for_owner on public.profiles for select to authenticated
  using (exists (
    select 1 from public.membership_requests r
    join public.groups g on g.id = r.group_id
    where r.user_id = profiles.id and g.owner_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.notify_membership_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
begin
  if tg_op = 'INSERT' then
    select owner_id into owner from public.groups where id = new.group_id;
    insert into public.notifications (user_id, kind, group_id, request_id, actor_id)
    values (owner, 'membership_requested', new.group_id, new.id, new.user_id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status <> 'pending' then
    insert into public.notifications (user_id, kind, group_id, request_id, actor_id)
    values (new.user_id,
            case when new.status = 'approved' then 'request_approved'::public.notification_kind
                 else 'request_rejected'::public.notification_kind end,
            new.group_id, new.id, new.reviewed_by);
    -- The owner's own "requested" notification is settled.
    update public.notifications set read_at = coalesce(read_at, now())
    where request_id = new.id and kind = 'membership_requested';
  end if;
  return null;
end;
$$;
create trigger membership_requests_notify after insert or update on public.membership_requests
  for each row execute function public.notify_membership_request();

create or replace function public.notify_member_joined()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'member' then
    insert into public.notifications (user_id, kind, group_id, actor_id)
    select gm.user_id, 'member_joined', new.group_id, new.user_id
    from public.group_members gm
    where gm.group_id = new.group_id and gm.user_id <> new.user_id;
  end if;
  return null;
end;
$$;
create trigger group_members_notify after insert on public.group_members
  for each row execute function public.notify_member_joined();

create or replace function public.notify_item_added()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, kind, group_id, item_id, actor_id)
  select gm.user_id, 'item_added', new.group_id, new.id, new.uploader_id
  from public.group_members gm
  where gm.group_id = new.group_id and gm.user_id <> new.uploader_id;
  return null;
end;
$$;
create trigger clothing_items_notify after insert on public.clothing_items
  for each row execute function public.notify_item_added();

create or replace function public.notify_item_wanted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item public.clothing_items;
begin
  if new.vote = 'want' and (tg_op = 'INSERT' or old.vote <> 'want') then
    select * into item from public.clothing_items where id = new.item_id;
    insert into public.notifications (user_id, kind, group_id, item_id, actor_id)
    values (item.uploader_id, 'item_wanted', item.group_id, item.id, new.voter_id);
  end if;
  return null;
end;
$$;
create trigger votes_notify after insert or update on public.votes
  for each row execute function public.notify_item_wanted();

-- ---------------------------------------------------------------------------
-- Reading: one RPC with the names resolved, so the list never depends on what the
-- recipient may read elsewhere (a rejected applicant cannot read the group row).
-- ---------------------------------------------------------------------------
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
  left join public.groups g on g.id = n.group_id
  left join public.clothing_items ci on ci.id = n.item_id
  left join public.profiles p on p.id = n.actor_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.my_notifications(integer) from public;
revoke all on function public.mark_notifications_read(uuid[]) from public;
grant execute on function public.my_notifications(integer) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
