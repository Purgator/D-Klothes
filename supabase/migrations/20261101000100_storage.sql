-- Private photo bucket. Objects live at <group_id>/<uploader_id>/<file>.jpg.
-- Browser-side checks are UX only; these limits and policies are the authorization.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path helpers: the first folder is the group, the second the uploader.
create or replace function public.photo_path_group(p_name text)
returns uuid language sql immutable as $$
  select case when (storage.foldername(p_name))[1] ~ '^[0-9a-f-]{36}$'
              then (storage.foldername(p_name))[1]::uuid end;
$$;
create or replace function public.photo_path_uploader(p_name text)
returns uuid language sql immutable as $$
  select case when (storage.foldername(p_name))[2] ~ '^[0-9a-f-]{36}$'
              then (storage.foldername(p_name))[2]::uuid end;
$$;

-- Approved members of the group named by the path may read its photos.
create policy photos_select_member on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and public.is_group_member(public.photo_path_group(name))
  );

-- Members may upload only into their own folder of a group they belong to.
create policy photos_insert_member_own_folder on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and array_length(storage.foldername(name), 1) = 2
    and public.photo_path_uploader(name) = auth.uid()
    and public.is_group_member(public.photo_path_group(name))
  );

-- The uploader or the group owner may delete a photo.
create policy photos_delete_uploader_or_owner on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.photo_path_uploader(name) = auth.uid()
      or public.is_group_owner(public.photo_path_group(name))
    )
  );
