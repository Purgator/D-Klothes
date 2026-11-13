-- pgTAP tests for the per-group upload policy (every member vs. owner only).
begin;
select plan(15);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000051', 'up-owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000052', 'up-member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000051', 'UpOwner'),
  ('00000000-0000-0000-0000-000000000052', 'UpMember');
select public.set_account_tier('up-owner@test.local', 'premium');

-- Creation: the option defaults to "everyone" and can be set to "owner only".
select tests.login('00000000-0000-0000-0000-000000000051');
create temporary table t_open as select * from public.create_group('Open group');
create temporary table t_closed as select * from public.create_group('Closed group', false);
grant select on t_open, t_closed to anon, authenticated;
select is((select members_can_upload from t_open), true, 'create_group lets every member upload by default');
select is((select members_can_upload from t_closed), false, 'create_group can restrict uploads to the owner');

select tests.logout();
insert into public.group_members (group_id, user_id, role) values
  ((select id from t_open), '00000000-0000-0000-0000-000000000052', 'member'),
  ((select id from t_closed), '00000000-0000-0000-0000-000000000052', 'member');

-- Upload right as seen by the clients.
select tests.login('00000000-0000-0000-0000-000000000052');
select is(public.can_upload_to_group((select id from t_open)), true, 'a member may upload to an open group');
select is(public.can_upload_to_group((select id from t_closed)), false, 'a member may not upload to an owner-only group');
select tests.login('00000000-0000-0000-0000-000000000051');
select is(public.can_upload_to_group((select id from t_closed)), true, 'the owner may always upload');
select tests.anon();
select throws_ok($$select public.can_upload_to_group((select id from t_open))$$, '42501', null, 'anon may not even ask');

-- Storage: an upload is opened first, and both steps follow the option.
select tests.login('00000000-0000-0000-0000-000000000052');
create temporary table t_member_upload as select public.open_photo_upload((select id from t_open)) as path;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select path from t_member_upload), '00000000-0000-0000-0000-000000000052')$$,
  'a member uploads into an open group');
select throws_ok($$select public.open_photo_upload((select id from t_closed))$$, 'P0014', null,
  'a member cannot open an upload in an owner-only group');
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select id from t_closed) || '/00000000-0000-0000-0000-000000000052/a.jpg', '00000000-0000-0000-0000-000000000052')$$,
  '42501', null, 'a member cannot upload into an owner-only group');
select tests.login('00000000-0000-0000-0000-000000000051');
create temporary table t_owner_upload as select public.open_photo_upload((select id from t_closed)) as path;
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner) values ('photos', (select path from t_owner_upload), '00000000-0000-0000-0000-000000000051')$$,
  'the owner uploads into an owner-only group');
-- The option is checked again when the file arrives.
select tests.logout();
update public.groups set members_can_upload = false where id = (select id from t_open);
select tests.login('00000000-0000-0000-0000-000000000052');
select is(public.can_store_photo((select path from t_member_upload)), false,
  'a reservation stops accepting a file when the group closes uploads');
select tests.logout();
update public.groups set members_can_upload = true where id = (select id from t_open);

-- Records: the trigger refuses a member's photo in an owner-only group even for trusted code.
select tests.logout();
select throws_ok(
  $$insert into public.clothing_items (group_id, uploader_id, storage_path)
    values ((select id from t_closed), '00000000-0000-0000-0000-000000000052', (select id from t_closed) || '/00000000-0000-0000-0000-000000000052/a.jpg')$$,
  'P0014', null, 'registering a member photo in an owner-only group is refused');
select lives_ok(
  $$insert into public.clothing_items (group_id, uploader_id, storage_path)
    values ((select id from t_closed), '00000000-0000-0000-0000-000000000051', (select id from t_closed) || '/00000000-0000-0000-0000-000000000051/a.jpg')$$,
  'registering the owner photo in an owner-only group works');

-- Settings: only the owner changes the option.
select tests.login('00000000-0000-0000-0000-000000000052');
update public.groups set members_can_upload = true where id = (select id from t_closed);
select is((select members_can_upload from public.groups where id = (select id from t_closed)), false,
  'a member cannot change the upload policy');
select tests.login('00000000-0000-0000-0000-000000000051');
update public.groups set members_can_upload = true where id = (select id from t_closed);
select is((select members_can_upload from public.groups where id = (select id from t_closed)), true,
  'the owner changes the upload policy');

select * from finish();
rollback;
