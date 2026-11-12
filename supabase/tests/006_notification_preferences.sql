-- pgTAP tests for notification preferences: muted kinds, muted groups, settled "wants it".
begin;
select plan(11);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000061', 'p-owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000062', 'p-quiet@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000063', 'p-other@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000061', 'POwner'),
  ('00000000-0000-0000-0000-000000000062', 'PQuiet'),
  ('00000000-0000-0000-0000-000000000063', 'POther');

select tests.login('00000000-0000-0000-0000-000000000061');
create temporary table t_pg as select * from public.create_group('Pref group');
grant select on t_pg to anon, authenticated;
select tests.logout();
insert into public.group_members (group_id, user_id) values
  ((select id from t_pg), '00000000-0000-0000-0000-000000000062'),
  ((select id from t_pg), '00000000-0000-0000-0000-000000000063');
delete from public.notifications;

-- Muted kind: the quiet member does not want item_added.
select tests.login('00000000-0000-0000-0000-000000000062');
select lives_ok($$update public.profiles set muted_kinds = '{item_added}' where id = '00000000-0000-0000-0000-000000000062'$$,
  'a member mutes a notification kind');
select tests.logout();
insert into public.clothing_items (id, group_id, uploader_id, storage_path)
values ('60000000-0000-0000-0000-000000000001', (select id from t_pg), '00000000-0000-0000-0000-000000000061',
        (select id from t_pg) || '/00000000-0000-0000-0000-000000000061/p1.jpg');
select is((select count(*) from public.notifications where kind = 'item_added' and user_id = '00000000-0000-0000-0000-000000000062'), 0::bigint,
  'a muted kind creates no notification');
select is((select count(*) from public.notifications where kind = 'item_added' and user_id = '00000000-0000-0000-0000-000000000063'), 1::bigint,
  'other members are still notified');

-- Muted group: the other member mutes the whole group; roles stay untouchable.
select tests.login('00000000-0000-0000-0000-000000000063');
select lives_ok($$update public.group_members set muted = true where group_id = (select id from t_pg) and user_id = '00000000-0000-0000-0000-000000000063'$$,
  'a member mutes a group');
select throws_ok($$update public.group_members set role = 'owner' where group_id = (select id from t_pg) and user_id = '00000000-0000-0000-0000-000000000063'$$,
  '42501', null, 'a member cannot change their role through the mute policy');
update public.group_members set muted = true where group_id = (select id from t_pg) and user_id = '00000000-0000-0000-0000-000000000061';
select tests.logout();
select is((select muted from public.group_members where group_id = (select id from t_pg) and user_id = '00000000-0000-0000-0000-000000000061'), false,
  'a member cannot mute a group for someone else');
insert into public.clothing_items (id, group_id, uploader_id, storage_path)
values ('60000000-0000-0000-0000-000000000002', (select id from t_pg), '00000000-0000-0000-0000-000000000061',
        (select id from t_pg) || '/00000000-0000-0000-0000-000000000061/p2.jpg');
select is((select count(*) from public.notifications where kind = 'item_added' and user_id = '00000000-0000-0000-0000-000000000063'), 1::bigint,
  'a muted group creates no new notification');

-- Withdrawing "I want this" settles the uploader's notification.
select tests.login('00000000-0000-0000-0000-000000000062');
select lives_ok($$select public.cast_vote('60000000-0000-0000-0000-000000000001', 'want')$$, 'the quiet member wants the item');
select tests.login('00000000-0000-0000-0000-000000000061');
select is((select count(*) from public.notifications where kind = 'item_wanted' and read_at is null), 1::bigint,
  'the uploader has an unread item_wanted notification');
select tests.login('00000000-0000-0000-0000-000000000062');
delete from public.votes where item_id = '60000000-0000-0000-0000-000000000001' and voter_id = '00000000-0000-0000-0000-000000000062';
select tests.login('00000000-0000-0000-0000-000000000061');
select is((select count(*) from public.notifications where kind = 'item_wanted' and read_at is null), 0::bigint,
  'withdrawing the vote marks the notification read');
select is((select count(*) from public.notifications where kind = 'item_wanted'), 1::bigint,
  'the notification itself is kept in the history');

select * from finish();
rollback;
