-- pgTAP tests for account tiers: admin-only grants and server-enforced limits.
begin;
select plan(17);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000011', 'free@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000012', 'premium@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000013', 'm1@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000014', 'm2@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000015', 'm3@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000016', 'm4@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000017', 'm5@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());

-- Profiles are created by the users themselves: the tier they send is ignored.
select tests.login('00000000-0000-0000-0000-000000000011');
select throws_ok($$insert into public.profiles (id, display_name, tier) values ('00000000-0000-0000-0000-000000000011', 'Free', 'premium')$$, '42501', null,
  'a client cannot pick a tier at onboarding');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000011', 'Free');
select is((select tier from public.my_profile()), 'free'::public.account_tier,
  'a new profile starts on the free tier');
select throws_ok($$update public.profiles set tier = 'premium' where id = '00000000-0000-0000-0000-000000000011'$$, '42501', null,
  'a client cannot upgrade their own tier');
select throws_ok($$update public.profiles set display_name = 'Free user' where id = '00000000-0000-0000-0000-000000000011'$$, '42501', null,
  'a client cannot rename themselves');
select throws_ok($$select public.set_account_tier('free@test.local', 'premium')$$, '42501', null,
  'set_account_tier is refused for signed-in users');

select tests.login('00000000-0000-0000-0000-000000000012');
insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000012', 'Premium');
select tests.logout();
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000013', 'M1'), ('00000000-0000-0000-0000-000000000014', 'M2'),
  ('00000000-0000-0000-0000-000000000015', 'M3'), ('00000000-0000-0000-0000-000000000016', 'M4'),
  ('00000000-0000-0000-0000-000000000017', 'M5');

-- The administrator (no JWT) grants premium.
select is((select tier from public.set_account_tier('premium@test.local', 'premium', 'friend')), 'premium'::public.account_tier,
  'the administrator grants premium');
select throws_ok($$select public.set_account_tier('nobody@test.local', 'premium')$$, 'P0002', null,
  'granting to an unknown email fails');

-- Owned groups: free = 1, premium = 20.
select tests.login('00000000-0000-0000-0000-000000000011');
create temporary table t_free_group as select * from public.create_group('Free group');
grant select on t_free_group to anon, authenticated;
select throws_ok($$select public.create_group('Second group')$$, 'P0010', null, 'a free account owns at most one group');
select is((select owned_groups_limit from public.my_entitlements()), 1, 'my_entitlements reports the free group limit');

select tests.login('00000000-0000-0000-0000-000000000012');
select lives_ok($$select public.create_group('P1')$$, 'a premium account creates a first group');
select lives_ok($$select public.create_group('P2')$$, 'a premium account creates a second group');

-- Active invitations: free = 3.
select tests.login('00000000-0000-0000-0000-000000000011');
select lives_ok($$select public.create_invitation((select id from t_free_group))$$, 'invitation 1');
select lives_ok($$select public.create_invitation((select id from t_free_group))$$, 'invitation 2');
select lives_ok($$select public.create_invitation((select id from t_free_group))$$, 'invitation 3');
select throws_ok($$select public.create_invitation((select id from t_free_group))$$, 'P0011', null,
  'a free account has at most three active invitation links');

-- Members per group: free = 5 including the owner.
select tests.logout();
insert into public.group_members (group_id, user_id) values
  ((select id from t_free_group), '00000000-0000-0000-0000-000000000013'),
  ((select id from t_free_group), '00000000-0000-0000-0000-000000000014'),
  ((select id from t_free_group), '00000000-0000-0000-0000-000000000015'),
  ((select id from t_free_group), '00000000-0000-0000-0000-000000000016');
insert into public.membership_requests (id, group_id, user_id) values
  ('20000000-0000-0000-0000-000000000001', (select id from t_free_group), '00000000-0000-0000-0000-000000000017');
select tests.login('00000000-0000-0000-0000-000000000011');
select throws_ok($$select public.review_membership_request('20000000-0000-0000-0000-000000000001', true)$$, 'P0012', null,
  'approving a sixth member of a free group is refused');

-- Photos: free = 10, enforced by trigger whoever inserts.
select tests.logout();
insert into public.clothing_items (group_id, uploader_id, storage_path)
select (select id from t_free_group), '00000000-0000-0000-0000-000000000011', (select id from t_free_group) || '/00000000-0000-0000-0000-000000000011/' || n || '.jpg'
from generate_series(1, 10) n;
select throws_ok($$insert into public.clothing_items (group_id, uploader_id, storage_path)
  values ((select id from t_free_group), '00000000-0000-0000-0000-000000000011', (select id from t_free_group) || '/00000000-0000-0000-0000-000000000011/11.jpg')$$,
  'P0013', null, 'an eleventh photo of a free account is refused even for the service role');

select * from finish();
rollback;
