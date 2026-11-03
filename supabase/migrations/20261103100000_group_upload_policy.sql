-- Who may add photos to a group: every member (default) or only the owner.
-- Chosen at creation and changeable by the owner in the group settings. Enforced in the
-- Storage insert policy, in a trigger on clothing_items and in the register-photo function.

alter table public.groups add column members_can_upload boolean not null default true;

-- True when the caller is a member allowed to add photos to the group.
create or replace function public.can_upload_to_group(p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    join public.group_members gm on gm.group_id = g.id and gm.user_id = auth.uid()
    where g.id = p_group_id and (g.members_can_upload or g.owner_id = auth.uid())
  );
$$;
revoke all on function public.can_upload_to_group(uuid) from public;
grant execute on function public.can_upload_to_group(uuid) to authenticated;

-- Storage: uploads into a group folder require the upload right, not just membership.
drop policy photos_insert_member_own_folder on storage.objects;
create policy photos_insert_member_own_folder on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and array_length(storage.foldername(name), 1) = 2
    and public.photo_path_uploader(name) = auth.uid()
    and public.can_upload_to_group(public.photo_path_group(name))
  );

-- Records: even trusted code cannot register a photo for a member who may not upload.
create or replace function public.clothing_items_check_upload_policy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.groups g
    where g.id = new.group_id and (g.members_can_upload or g.owner_id = new.uploader_id)
  ) then
    raise exception 'only the group owner may add photos to this group' using errcode = 'P0014';
  end if;
  return new;
end;
$$;
create trigger clothing_items_check_upload_policy before insert on public.clothing_items
  for each row execute function public.clothing_items_check_upload_policy();

-- Group creation takes the option (same body as before otherwise).
drop function public.create_group(text);
create function public.create_group(p_name text, p_members_can_upload boolean default true)
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
  insert into public.groups (name, owner_id, members_can_upload)
  values (btrim(p_name), uid, coalesce(p_members_can_upload, true)) returning * into g;
  insert into public.group_members (group_id, user_id, role) values (g.id, uid, 'owner');
  insert into public.group_feed_state (group_id) values (g.id);
  return g;
end;
$$;
revoke all on function public.create_group(text, boolean) from public;
grant execute on function public.create_group(text, boolean) to authenticated;
