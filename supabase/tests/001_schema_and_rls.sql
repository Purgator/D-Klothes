-- pgTAP tests for vote constraints, invitation lifecycle, membership and account boundaries.
-- Run with: supabase test db  (requires a local stack: supabase start)
begin;
select plan(36);

-- ---------------------------------------------------------------------------
-- Fixtures: four auth users with profiles.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'member@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'applicant@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000004', 'stranger@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000001', 'Owner'),
  ('00000000-0000-0000-0000-000000000002', 'Member'),
  ('00000000-0000-0000-0000-000000000003', 'Applicant'),
  ('00000000-0000-0000-0000-000000000004', 'Stranger');


-- ---------------------------------------------------------------------------
-- Group creation
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000001');
create temporary table t_group as select * from public.create_group('  Test group  ');
grant select on t_group to anon, authenticated;
select is((select name from t_group), 'Test group', 'create_group trims the name');
select is((select count(*) from public.group_members where group_id = (select id from t_group) and role = 'owner'), 1::bigint,
  'create_group adds the owner membership');
select is((select count(*) from public.group_feed_state where group_id = (select id from t_group)), 1::bigint,
  'create_group seeds the feed state row');

-- Member 2 is added directly (fixture) to test member behaviour.
select tests.logout();
insert into public.group_members (group_id, user_id, role) values ((select id from t_group), '00000000-0000-0000-0000-000000000002', 'member');
insert into public.clothing_items (id, group_id, uploader_id, storage_path, title)
values ('10000000-0000-0000-0000-000000000001', (select id from t_group), '00000000-0000-0000-0000-000000000001',
        (select id from t_group) || '/00000000-0000-0000-0000-000000000001/a.jpg', 'Jacket');

-- ---------------------------------------------------------------------------
-- Read boundaries
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000004');
select is((select count(*) from public.groups), 0::bigint, 'a stranger sees no group');
select is((select count(*) from public.clothing_items), 0::bigint, 'a stranger sees no item');
select is((select count(*) from public.group_members), 0::bigint, 'a stranger sees no roster');
select is((select count(*) from public.profiles), 1::bigint, 'a stranger sees only their own profile');

select tests.login('00000000-0000-0000-0000-000000000002');
select is((select count(*) from public.clothing_items), 1::bigint, 'a member sees the group items');
select is((select count(*) from public.profiles), 2::bigint, 'a member sees co-member profiles only');

select tests.anon();
select throws_ok($$select count(*) from public.groups$$, '42501', null, 'anon cannot even query');

-- ---------------------------------------------------------------------------
-- Votes: one per member per item, changeable, private.
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000002');
select lives_ok($$select public.cast_vote('10000000-0000-0000-0000-000000000001', 'keep')$$, 'a member can vote');
select lives_ok($$select public.cast_vote('10000000-0000-0000-0000-000000000001', 'want')$$, 'a member can change their vote');
select is((select count(*) from public.votes where voter_id = '00000000-0000-0000-0000-000000000002'), 1::bigint,
  'changing a vote keeps a single row');
select is((select vote from public.votes where voter_id = '00000000-0000-0000-0000-000000000002'), 'want'::public.vote_type,
  'the latest choice wins');
select throws_ok($$insert into public.votes (item_id, voter_id, vote) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'keep')$$,
  '42501', null, 'direct inserts into votes are denied');

select tests.login('00000000-0000-0000-0000-000000000001');
select throws_ok($$select public.cast_vote('10000000-0000-0000-0000-000000000001', 'keep')$$, '42501', null,
  'the uploader cannot vote on their own item');
select is((select count(*) from public.votes where vote = 'want'), 1::bigint, 'the uploader sees who wants the item');

select tests.login('00000000-0000-0000-0000-000000000004');
select throws_ok($$select public.cast_vote('10000000-0000-0000-0000-000000000001', 'keep')$$, '42501', null,
  'a non-member cannot vote');
select is((select count(*) from public.votes), 0::bigint, 'a non-member sees no vote');

select tests.logout();
select throws_ok($$insert into public.votes (item_id, voter_id, vote) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'keep')$$,
  '23505', null, 'the primary key enforces one vote per member per item');

-- Aggregate counts hide individual choices but are visible to members.
select tests.login('00000000-0000-0000-0000-000000000002');
select is((select want_count from public.group_vote_counts((select id from t_group))), 1, 'members see aggregate counts');
select tests.login('00000000-0000-0000-0000-000000000004');
select is((select count(*) from public.group_vote_counts((select id from t_group))), 0::bigint, 'non-members get no counts');

-- ---------------------------------------------------------------------------
-- Invitation lifecycle
-- ---------------------------------------------------------------------------
select tests.login('00000000-0000-0000-0000-000000000002');
select throws_ok($$select public.create_invitation((select id from t_group))$$, '42501', null,
  'only the owner can create an invitation');

select tests.login('00000000-0000-0000-0000-000000000001');
create temporary table t_inv as select * from public.create_invitation((select id from t_group));
grant select on t_inv to anon, authenticated;
select is((select char_length(token) from t_inv), 43, 'the token is 43 base64url characters');
select is((select count(*) from public.invitations where token_hash = encode(extensions.digest((select token from t_inv), 'sha256'), 'hex')), 1::bigint,
  'only the sha256 hash of the token is stored');

select tests.anon();
select is((select valid from public.invitation_preview((select token from t_inv))), true, 'anon can preview a valid link');
select is((select group_name from public.invitation_preview((select token from t_inv))), 'Test group', 'the preview shows the group name only');

select tests.login('00000000-0000-0000-0000-000000000003');
create temporary table t_req as select * from public.redeem_invitation((select token from t_inv), 'hello');
grant select on t_req to anon, authenticated;
select is((select status from t_req), 'pending'::public.request_status, 'redemption creates a pending request');
select throws_ok($$select public.redeem_invitation((select token from t_inv), 'again')$$, 'P0002', null,
  'a redeemed link cannot be used again');
select is((select count(*) from public.clothing_items), 0::bigint, 'a pending applicant sees no item');
select is((select group_name from public.my_membership_requests()), 'Test group', 'a pending applicant sees the group name of their own request');

-- Owner reviews: rejection does not reactivate the link; approval adds the member.
select tests.login('00000000-0000-0000-0000-000000000002');
select throws_ok($$select public.review_membership_request((select id from t_req), true)$$, '42501', null,
  'only the owner can review requests');

select tests.login('00000000-0000-0000-0000-000000000001');
select lives_ok($$select public.review_membership_request((select id from t_req), true)$$, 'the owner approves the request');
select is((select reviewed_by from public.membership_requests where id = (select id from t_req)), '00000000-0000-0000-0000-000000000001'::uuid,
  'approval records the reviewer');
select throws_ok($$select public.review_membership_request((select id from t_req), false)$$, 'P0003', null,
  'a request cannot be reviewed twice');

select tests.login('00000000-0000-0000-0000-000000000003');
select is((select count(*) from public.clothing_items), 1::bigint, 'an approved member sees the items');

select * from finish();
rollback;
