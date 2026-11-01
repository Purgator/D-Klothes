-- pgTAP tests for ownership transfer, member removal and account-boundary constraints.
begin;
select plan(12);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'stranger@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'Member'),
  ('00000000-0000-0000-0000-000000000004', 'Stranger');


select tests.login('00000000-0000-0000-0000-000000000001');
create temporary table t_group as select * from public.create_group('Owned');
grant select on t_group to anon, authenticated;
select tests.logout();
insert into public.group_members (group_id, user_id, role) values ((select id from t_group), '00000000-0000-0000-0000-000000000002', 'member');

-- An owner profile cannot be deleted while they own a group (FK restrict).
select throws_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-000000000001'$$, '23503', null,
  'deleting a group owner profile is refused until ownership is transferred');

-- Only one owner row per group.
select throws_ok($$update public.group_members set role = 'owner' where user_id = '00000000-0000-0000-0000-000000000002'$$, '23505', null,
  'a group cannot have two owner rows');

-- Member leaves / owner removes.
select tests.login('00000000-0000-0000-0000-000000000002');
select throws_ok($$select public.transfer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002')$$, '42501', null,
  'a member cannot transfer ownership');
delete from public.group_members where group_id = (select id from t_group) and user_id = '00000000-0000-0000-0000-000000000001';
select tests.logout();
select is((select count(*) from public.group_members where role = 'owner'), 1::bigint, 'a member cannot remove the owner');

select tests.login('00000000-0000-0000-0000-000000000004');
delete from public.group_members where group_id = (select id from t_group);
select tests.logout();
select is((select count(*) from public.group_members where group_id = (select id from t_group)), 2::bigint, 'a stranger cannot remove members');

-- Ownership transfer.
select tests.login('00000000-0000-0000-0000-000000000001');
select throws_ok($$select public.transfer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000004')$$, 'P0004', null,
  'ownership can only go to a member');
select lives_ok($$select public.transfer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002')$$,
  'the owner transfers ownership to a member');
select tests.logout();
select is((select owner_id from public.groups where id = (select id from t_group)), '00000000-0000-0000-0000-000000000002'::uuid,
  'groups.owner_id follows the transfer');
select is((select role from public.group_members where group_id = (select id from t_group) and user_id = '00000000-0000-0000-0000-000000000001'), 'member'::public.membership_role,
  'the previous owner becomes a member');

-- The previous owner can now leave, and their profile can be deleted (cascade).
select tests.login('00000000-0000-0000-0000-000000000001');
delete from public.group_members where group_id = (select id from t_group) and user_id = '00000000-0000-0000-0000-000000000001';
select tests.logout();
select is((select count(*) from public.group_members where user_id = '00000000-0000-0000-0000-000000000001'), 0::bigint, 'a member can leave a group');
select lives_ok($$delete from public.profiles where id = '00000000-0000-0000-0000-000000000001'$$, 'a non-owner profile can be deleted');

-- Retention deadline defaults to two years after creation.
insert into public.clothing_items (group_id, uploader_id, storage_path)
values ((select id from t_group), '00000000-0000-0000-0000-000000000002', (select id from t_group) || '/00000000-0000-0000-0000-000000000002/b.jpg');
select ok((select retention_deadline between now() + interval '2 years' - interval '1 minute' and now() + interval '2 years' + interval '1 minute'
           from public.clothing_items limit 1), 'retention deadline defaults to two years after upload');

select * from finish();
rollback;
