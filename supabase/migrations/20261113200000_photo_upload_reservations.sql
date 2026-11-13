-- A photo is reserved before it is uploaded.
--
-- Until now the Storage policy let a member write any file into their own folder of a group,
-- and the photo only met the plan limit when register-photo recorded it. A member writing
-- their own requests could skip that last step: the files counted against nothing and no job
-- knew about them.
--
-- An upload now takes three calls:
--   1. open_photo_upload(group)   checks the right to upload and the plan limit, counts the
--                                 reservation against it and returns the one path to use;
--   2. the Storage upload         is accepted for that exact path only, for 15 minutes;
--   3. register-photo             checks the file and turns the reservation into the record
--                                 (complete_photo_upload).
-- The scheduled cleanup removes reservations that were never completed, with their file, and
-- any file of the bucket that has neither a record nor a reservation.

create table public.photo_uploads (
  storage_path text primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint photo_uploads_path_in_own_folder
    check (starts_with(storage_path, group_id::text || '/' || uploader_id::text || '/'))
);
create index photo_uploads_uploader_idx on public.photo_uploads (uploader_id);

-- Nothing for the API roles: reservations are only reached through the functions below.
alter table public.photo_uploads enable row level security;
grant all on table public.photo_uploads to service_role;

-- ---------------------------------------------------------------------------
-- 1. Open
-- ---------------------------------------------------------------------------
create function public.open_photo_upload(p_group_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pending integer;
  owned integer;
  path text;
begin
  if uid is null or not public.is_group_member(p_group_id) then
    raise exception 'not a member of this group' using errcode = '42501';
  end if;
  if not public.can_upload_to_group(p_group_id) then
    raise exception 'only the group owner may add photos to this group' using errcode = 'P0014';
  end if;

  -- One open at a time per account, so two requests cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('photo_upload:' || uid::text, 0));

  -- Reservations that can no longer receive a file and never got one are simply dropped.
  delete from public.photo_uploads u
  where u.uploader_id = uid
    and u.created_at < now() - interval '15 minutes'
    and not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = u.storage_path);

  select count(*) into pending from public.photo_uploads where uploader_id = uid;
  if pending >= 5 then
    raise exception 'too many uploads in progress' using errcode = 'P0016';
  end if;
  select count(*) into owned from public.clothing_items where uploader_id = uid;
  if owned + pending >= public.tier_limit(public.account_tier_of(uid), 'photos') then
    raise exception 'photo limit reached for this account' using errcode = 'P0013';
  end if;

  path := p_group_id::text || '/' || uid::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into public.photo_uploads (storage_path, group_id, uploader_id) values (path, p_group_id, uid);
  return path;
end;
$$;

-- Give a reservation back after a failed attempt. Refused while its file is still in Storage:
-- the file goes first, so a reservation never disappears from under a file.
create function public.cancel_photo_upload(p_path text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.photo_uploads u
  where u.storage_path = p_path
    and u.uploader_id = auth.uid()
    and not exists (select 1 from storage.objects o where o.bucket_id = 'photos' and o.name = u.storage_path);
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Upload
-- ---------------------------------------------------------------------------
-- True for the path of a reservation the caller opened less than 15 minutes ago, in a group
-- they may still upload to.
create function public.can_store_photo(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.photo_uploads u
    where u.storage_path = p_name
      and u.uploader_id = auth.uid()
      and u.created_at > now() - interval '15 minutes'
      and public.can_upload_to_group(u.group_id)
  );
$$;

-- True for the path of a reservation of the caller, whatever its age.
create function public.owns_pending_photo(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.photo_uploads u
    where u.storage_path = p_name and u.uploader_id = auth.uid()
  );
$$;

drop policy photos_insert_member_own_folder on storage.objects;
create policy photos_insert_reserved on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_store_photo(name));

-- A published photo is deleted through delete-photo, which removes the file and the record
-- together. Directly, a member may only take back a file that is not registered yet.
drop policy photos_delete_uploader_or_owner on storage.objects;
create policy photos_delete_pending_own on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.owns_pending_photo(name));

-- ---------------------------------------------------------------------------
-- 3. Validate (called by register-photo once the file has been checked)
-- ---------------------------------------------------------------------------
create function public.complete_photo_upload(p_path text, p_uploader uuid, p_title text)
returns public.clothing_items
language plpgsql security definer set search_path = public as $$
declare
  up public.photo_uploads;
  item public.clothing_items;
begin
  select * into up from public.photo_uploads
  where storage_path = p_path and uploader_id = p_uploader for update;
  -- Past 45 minutes the reservation belongs to the cleanup, which starts at one hour.
  if up.storage_path is null or up.created_at < now() - interval '45 minutes' then
    raise exception 'no open upload for this file' using errcode = 'P0017';
  end if;
  insert into public.clothing_items (group_id, uploader_id, storage_path, title)
  values (up.group_id, up.uploader_id, up.storage_path, coalesce(p_title, ''))
  returning * into item;
  delete from public.photo_uploads where storage_path = p_path;
  return item;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
-- Files of the bucket with neither a record nor a reservation. Read only: the cleanup
-- function deletes them through the Storage API.
create function public.orphan_photo_paths(p_older_than interval default interval '1 hour', p_limit integer default 100)
returns setof text
language sql stable security definer set search_path = public as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'photos'
    and o.created_at < now() - p_older_than
    and not exists (select 1 from public.clothing_items c where c.storage_path = o.name)
    and not exists (select 1 from public.photo_uploads u where u.storage_path = o.name)
  order by o.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

revoke execute on function
  public.open_photo_upload(uuid),
  public.cancel_photo_upload(text),
  public.can_store_photo(text),
  public.owns_pending_photo(text),
  public.complete_photo_upload(text, uuid, text),
  public.orphan_photo_paths(interval, integer)
from public, anon, authenticated;

grant execute on function
  public.open_photo_upload(uuid),
  public.cancel_photo_upload(text),
  public.can_store_photo(text),
  public.owns_pending_photo(text)
to authenticated;

grant execute on function
  public.complete_photo_upload(text, uuid, text),
  public.orphan_photo_paths(interval, integer)
to service_role;

-- The cleanup now also frees abandoned reservations: run it every hour instead of every night.
select cron.schedule('dklothes-retention-cleanup', '17 * * * *', $$select public.run_retention_cleanup();$$);
