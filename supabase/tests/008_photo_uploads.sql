-- pgTAP tests for the upload reservation: open, upload to the reserved path, validate.
begin;
select plan(27);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000081', 'res-owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000082', 'res-member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000083', 'res-stranger@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000081', 'ResOwner'),
  ('00000000-0000-0000-0000-000000000082', 'ResMember'),
  ('00000000-0000-0000-0000-000000000083', 'ResStranger');

select tests.login('00000000-0000-0000-0000-000000000081');
create temporary table t_group as select * from public.create_group('Reservations');
grant select on t_group to anon, authenticated;
select tests.logout();
insert into public.group_members (group_id, user_id, role)
values ((select id from t_group), '00000000-0000-0000-0000-000000000082', 'member');

-- 1. Open: members only, and the server chooses the path.
select tests.anon();
select throws_ok($$select public.open_photo_upload((select id from t_group))$$, '42501', null, 'anon cannot open an upload');
select tests.login('00000000-0000-0000-0000-000000000083');
select throws_ok($$select public.open_photo_upload((select id from t_group))$$, '42501', null, 'a stranger cannot open an upload');
select tests.login('00000000-0000-0000-0000-000000000081');
create temporary table t_first as select public.open_photo_upload((select id from t_group)) as path;
grant select on t_first to authenticated;
select matches(
  (select path from t_first),
  '^' || (select id from t_group) || '/00000000-0000-0000-0000-000000000081/[0-9a-f-]{36}\.jpg$',
  'the reserved path is in the caller''s folder of the group');
select throws_ok($$select * from public.photo_uploads$$, '42501', null, 'reservations are not readable through the API');
select throws_ok(
  $$insert into public.photo_uploads (storage_path, group_id, uploader_id)
    values ((select id from t_group) || '/00000000-0000-0000-0000-000000000081/x.jpg', (select id from t_group), '00000000-0000-0000-0000-000000000081')$$,
  '42501', null, 'a reservation cannot be written directly');

-- 2. Upload: the reserved path and nothing else.
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select id from t_group) || '/00000000-0000-0000-0000-000000000081/free.jpg', '00000000-0000-0000-0000-000000000081')$$,
  '42501', null, 'a file without a reservation is refused, even in one''s own folder');
select tests.login('00000000-0000-0000-0000-000000000082');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select path from t_first), '00000000-0000-0000-0000-000000000082')$$,
  '42501', null, 'another member cannot use the reservation');
select tests.login('00000000-0000-0000-0000-000000000081');
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select path from t_first), '00000000-0000-0000-0000-000000000081')$$,
  'the file is accepted at the reserved path');
select is(public.owns_pending_photo((select path from t_first)), true, 'the uploader may take back a file that is not registered yet');
select is(public.cancel_photo_upload((select path from t_first)), false, 'a reservation is not given back while its file exists');

-- 3. Validate: trusted code only, and the reservation becomes the record.
select throws_ok(
  $$select public.complete_photo_upload((select path from t_first), '00000000-0000-0000-0000-000000000081', 'Coat')$$,
  '42501', null, 'a member cannot validate their own upload');
select throws_ok($$select public.orphan_photo_paths()$$, '42501', null, 'a member cannot list files');
select tests.logout();
select is(
  (select storage_path from public.complete_photo_upload((select path from t_first), '00000000-0000-0000-0000-000000000081', 'Coat')),
  (select path from t_first), 'validation creates the photo record');
select is((select count(*)::int from public.photo_uploads where storage_path = (select path from t_first)), 0,
  'validation consumes the reservation');
select throws_ok(
  $$select public.complete_photo_upload((select path from t_first), '00000000-0000-0000-0000-000000000081', 'Coat')$$,
  'P0017', null, 'a file is validated once');
select tests.login('00000000-0000-0000-0000-000000000081');
select is(public.owns_pending_photo((select path from t_first)), false, 'a published file can no longer be deleted directly');
select is(public.can_store_photo((select path from t_first)), false, 'a published path accepts no new file');

-- Plan limit: reservations count. A free account holds 10 photos; this one has 1.
select tests.logout();
insert into public.clothing_items (group_id, uploader_id, storage_path)
select (select id from t_group), '00000000-0000-0000-0000-000000000081',
       (select id from t_group) || '/00000000-0000-0000-0000-000000000081/seed-' || n || '.jpg'
from generate_series(1, 8) n;
select tests.login('00000000-0000-0000-0000-000000000081');
create temporary table t_last as select public.open_photo_upload((select id from t_group)) as path;
select throws_ok($$select public.open_photo_upload((select id from t_group))$$, 'P0013', null,
  'a reservation takes the last slot of the plan');
select is(public.cancel_photo_upload((select path from t_last)), true, 'a reservation without a file is given back');
select lives_ok($$select public.open_photo_upload((select id from t_group))$$, 'which frees the slot');

-- At most five uploads in progress per account.
select tests.login('00000000-0000-0000-0000-000000000082');
create temporary table t_member as
  select public.open_photo_upload((select id from t_group)) as path from generate_series(1, 5);
select throws_ok($$select public.open_photo_upload((select id from t_group))$$, 'P0016', null,
  'a sixth upload in progress is refused');

-- Expiry: 15 minutes to upload, 45 to validate; an expired reservation without a file frees itself.
select tests.logout();
update public.photo_uploads set created_at = now() - interval '20 minutes'
where storage_path = (select min(path) from t_member);
select tests.login('00000000-0000-0000-0000-000000000082');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select min(path) from t_member), '00000000-0000-0000-0000-000000000082')$$,
  '42501', null, 'a reservation accepts a file for 15 minutes');
select lives_ok($$select public.open_photo_upload((select id from t_group))$$,
  'an expired reservation without a file makes room for a new one');
select tests.logout();
select is((select count(*)::int from public.photo_uploads where storage_path = (select min(path) from t_member)), 0,
  'and is dropped');
update public.photo_uploads set created_at = now() - interval '50 minutes'
where storage_path = (select max(path) from t_member);
select throws_ok(
  $$select public.complete_photo_upload((select max(path) from t_member), '00000000-0000-0000-0000-000000000082', '')$$,
  'P0017', null, 'a reservation older than 45 minutes is no longer validated');

-- Cleanup: a file with neither a record nor a reservation is an orphan; a published one is not.
insert into storage.objects (bucket_id, name, owner)
values ('photos', (select id from t_group) || '/00000000-0000-0000-0000-000000000082/lost.jpg', '00000000-0000-0000-0000-000000000082');
select results_eq(
  $$select * from public.orphan_photo_paths(interval '-1 minute', 100) p where p like (select id from t_group) || '/%'$$,
  $$select (select id from t_group) || '/00000000-0000-0000-0000-000000000082/lost.jpg'$$,
  'only the file nothing points to is listed');
select is_empty(
  $$select * from public.orphan_photo_paths(interval '1 hour', 100) p where p like (select id from t_group) || '/%'$$,
  'and only once it is old enough');

select * from finish();
rollback;
