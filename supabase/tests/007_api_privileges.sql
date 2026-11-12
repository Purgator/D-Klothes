-- pgTAP tests for the API privilege whitelist: what a hand-written request can and cannot do.
begin;
select plan(31);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000071', 'w-owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000072', 'w-member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000073', 'w-leaver@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000074', 'w-new@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000071', 'WOwner'),
  ('00000000-0000-0000-0000-000000000072', 'WMember'),
  ('00000000-0000-0000-0000-000000000073', 'WLeaver');
update public.profiles set tier = 'premium', tier_note = 'close friend' where id = '00000000-0000-0000-0000-000000000071';

select tests.login('00000000-0000-0000-0000-000000000071');
create temporary table t_wg as select * from public.create_group('Whitelist group');
grant select on t_wg to anon, authenticated;
create temporary table t_winv as select * from public.create_invitation((select id from t_wg));
grant select on t_winv to anon, authenticated;
select public.revoke_invitation((select id from t_winv));
select tests.logout();
insert into public.group_members (group_id, user_id) values
  ((select id from t_wg), '00000000-0000-0000-0000-000000000072'),
  ((select id from t_wg), '00000000-0000-0000-0000-000000000073');
insert into public.clothing_items (id, group_id, uploader_id, storage_path, title) values
  ('70000000-0000-0000-0000-000000000001', (select id from t_wg), '00000000-0000-0000-0000-000000000072',
   (select id from t_wg) || '/00000000-0000-0000-0000-000000000072/w1.jpg', 'Coat');

-- ---------------------------------------------------------------------------
-- Profiles: a display name is set once; private columns stay private.
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000074');
select throws_ok($$insert into public.profiles (id, display_name, created_at) values ('00000000-0000-0000-0000-000000000074', 'WNew', '2000-01-01')$$,
  '42501', null, 'a new profile cannot set its own creation date');
select lives_ok($$insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000074', 'WNew')$$,
  'a signed-in user creates their profile with a display name');
select throws_ok($$update public.profiles set display_name = 'Renamed' where id = '00000000-0000-0000-0000-000000000074'$$,
  '42501', null, 'a user cannot rename themselves with an update');
select throws_ok($$insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000074', 'Renamed')
                   on conflict (id) do update set display_name = excluded.display_name$$,
  '42501', null, 'a user cannot rename themselves with an upsert');
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-000000000074'$$,
  '42501', null, 'a user cannot delete their profile to create it again under another name');
select lives_ok($$update public.profiles set muted_kinds = '{item_added}' where id = '00000000-0000-0000-0000-000000000074'$$,
  'a user still changes their notification preferences');
select is((select display_name from public.my_profile()), 'WNew', 'the display name is the one chosen at creation');

select tests.login('00000000-0000-0000-0000-000000000072');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000071'), 'WOwner',
  'a member reads the names of co-members');
select throws_ok($$select tier_note from public.profiles where id = '00000000-0000-0000-0000-000000000071'$$,
  '42501', null, 'a member cannot read the plan note of a co-member');
select throws_ok($$select muted_kinds from public.profiles where id = '00000000-0000-0000-0000-000000000071'$$,
  '42501', null, 'a member cannot read the notification preferences of a co-member');
select is((select count(*) from public.my_profile()), 1::bigint, 'my_profile returns the caller and nobody else');
select tests.login('00000000-0000-0000-0000-000000000071');
select is((select tier_note from public.my_profile()), 'close friend', 'my_profile gives the caller their own plan note');

-- ---------------------------------------------------------------------------
-- Group mute: private to the member.
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000072');
select throws_ok($$select muted from public.group_members$$, '42501', null, 'nobody reads who muted a group');
select lives_ok($$update public.group_members set muted = true where group_id = (select id from t_wg) and user_id = '00000000-0000-0000-0000-000000000072'$$,
  'a member mutes a group for themselves');
select is(public.my_group_mute((select id from t_wg)), true, 'my_group_mute gives the caller their own setting');

-- ---------------------------------------------------------------------------
-- Photo records: the uploader edits the title, nothing else.
-- ---------------------------------------------------------------------------
select lives_ok($$update public.clothing_items set title = 'Winter coat' where id = '70000000-0000-0000-0000-000000000001'$$,
  'the uploader edits the title');
select throws_ok($$update public.clothing_items set storage_path = '/elsewhere/else/x.jpg' where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'the uploader cannot point the record at another file');
select throws_ok($$update public.clothing_items set retention_deadline = '9999-01-01' where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'the uploader cannot push back the retention deadline');
select throws_ok($$update public.clothing_items set group_id = (select id from t_wg) where id = '70000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'the uploader cannot move the record to another group');
select tests.logout();
select throws_ok($$update public.clothing_items set storage_path = 'elsewhere/else/x.jpg' where id = '70000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'even trusted code cannot point a record outside its own folder');

-- ---------------------------------------------------------------------------
-- Notifications: only the read mark is writable.
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000071');
select throws_ok($$update public.notifications set actor_id = '00000000-0000-0000-0000-000000000073' where user_id = '00000000-0000-0000-0000-000000000071'$$,
  '42501', null, 'a recipient cannot repoint a notification at someone else');
select lives_ok($$update public.notifications set read_at = now() where user_id = '00000000-0000-0000-0000-000000000071'$$,
  'a recipient marks their notifications read');

-- ---------------------------------------------------------------------------
-- Functions: internal helpers are not part of the API.
-- ---------------------------------------------------------------------------
select throws_ok($$select public.account_tier_of('00000000-0000-0000-0000-000000000071')$$, '42501', null,
  'a user cannot look up the plan of someone else');
select throws_ok($$select public.wants_notification('00000000-0000-0000-0000-000000000072', 'item_added', (select id from t_wg))$$, '42501', null,
  'a user cannot probe the notification preferences of someone else');
select throws_ok($$select public.item_group_id('70000000-0000-0000-0000-000000000001')$$, '42501', null,
  'a user cannot look up the group of an arbitrary item');
select tests.anon();
select throws_ok($$select public.run_retention_cleanup()$$, '42501', null, 'anon cannot trigger the retention job');
select throws_ok($$select public.my_notifications()$$, '42501', null, 'anon cannot call signed-in functions');

-- A dead invitation link says nothing about the group.
select is((select valid from public.invitation_preview((select token from t_winv))), false, 'a revoked link is not valid');
select is((select group_name from public.invitation_preview((select token from t_winv))), null, 'a revoked link does not name the group');

-- ---------------------------------------------------------------------------
-- Leaving a group: old notifications stop resolving names.
-- ---------------------------------------------------------------------------
select tests.logout();
delete from public.group_members where group_id = (select id from t_wg) and user_id = '00000000-0000-0000-0000-000000000073';
select tests.login('00000000-0000-0000-0000-000000000073');
select cmp_ok((select count(*) from public.my_notifications()), '>', 0::bigint, 'a former member keeps their notifications');
select is((select count(*) from public.my_notifications() where group_name is not null or item_title is not null or actor_name is not null), 0::bigint,
  'but they no longer reveal the group name, item titles or member names');

select * from finish();
rollback;
