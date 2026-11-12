-- pgTAP tests for ownership transfer, member removal and account-boundary constraints.
begin;
select plan(25);

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
select throws_ok($$select public.offer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002')$$, '42501', null,
  'a member cannot offer ownership');
delete from public.group_members where group_id = (select id from t_group) and user_id = '00000000-0000-0000-0000-000000000001';
select tests.logout();
select is((select count(*) from public.group_members where group_id = (select id from t_group) and role = 'owner'), 1::bigint, 'a member cannot remove the owner');

select tests.login('00000000-0000-0000-0000-000000000004');
delete from public.group_members where group_id = (select id from t_group);
select tests.logout();
select is((select count(*) from public.group_members where group_id = (select id from t_group)), 2::bigint, 'a stranger cannot remove members');

-- Ownership transfer.
select tests.login('00000000-0000-0000-0000-000000000001');
select throws_ok($$select public.offer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000004')$$, 'P0004', null,
  'ownership can only be offered to a member');
select throws_ok($$insert into public.ownership_offers (group_id, to_user) values ((select id from t_group), '00000000-0000-0000-0000-000000000002')$$, '42501', null,
  'an offer cannot be written directly');
select lives_ok($$select public.offer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002')$$,
  'the owner offers ownership to a member');
select tests.logout();
select is((select owner_id from public.groups where id = (select id from t_group)), '00000000-0000-0000-0000-000000000001'::uuid,
  'an offer alone changes nothing');

-- Only the member it was made to sees and answers the offer.
select tests.login('00000000-0000-0000-0000-000000000004');
select is((select count(*) from public.ownership_offers), 0::bigint, 'a stranger does not see the offer');
select throws_ok($$select public.respond_ownership_offer((select id from t_group), true)$$, 'P0015', null,
  'a stranger cannot accept an offer made to someone else');
select tests.login('00000000-0000-0000-0000-000000000002');
select is((select count(*) from public.ownership_offers), 1::bigint, 'the member sees the offer made to them');
select lives_ok($$select public.respond_ownership_offer((select id from t_group), false)$$, 'the member declines');
select tests.logout();
select is((select owner_id from public.groups where id = (select id from t_group)), '00000000-0000-0000-0000-000000000001'::uuid,
  'a declined offer leaves the owner in place');
select is((select count(*) from public.ownership_offers), 0::bigint, 'an answered offer is gone');
select is((select count(*) from public.notifications
           where kind = 'ownership_declined' and user_id = '00000000-0000-0000-0000-000000000001'), 1::bigint,
  'the owner is told about the refusal');
select is((select count(*) from public.notifications where kind = 'ownership_offered' and read_at is null), 0::bigint,
  'the offer notification is settled');

-- Withdrawn offer, then an accepted one.
select tests.login('00000000-0000-0000-0000-000000000001');
select public.offer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002');
select public.cancel_ownership_offer((select id from t_group));
select tests.login('00000000-0000-0000-0000-000000000002');
select throws_ok($$select public.respond_ownership_offer((select id from t_group), true)$$, 'P0015', null,
  'a withdrawn offer cannot be accepted');
select tests.login('00000000-0000-0000-0000-000000000001');
select public.offer_group_ownership((select id from t_group), '00000000-0000-0000-0000-000000000002');
select tests.login('00000000-0000-0000-0000-000000000002');
select lives_ok($$select public.respond_ownership_offer((select id from t_group), true)$$, 'the member accepts');
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
           from public.clothing_items where storage_path = (select id from t_group) || '/00000000-0000-0000-0000-000000000002/b.jpg'),
          'retention deadline defaults to two years after upload');

-- Deleting a group that still holds photos and votes: the cascade must not resurrect its feed state.
insert into public.votes (item_id, voter_id, vote)
values ((select id from public.clothing_items where storage_path = (select id from t_group) || '/00000000-0000-0000-0000-000000000002/b.jpg'),
        '00000000-0000-0000-0000-000000000004', 'keep');
select lives_ok($$delete from public.groups where id = (select id from t_group)$$, 'a group with photos and votes can be deleted');

select * from finish();
rollback;
