-- pgTAP tests for notifications: triggers, privacy, read marking, applicant visibility.
begin;
select plan(16);

insert into auth.users (id, email, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000021', 'n-owner@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000022', 'n-applicant@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000023', 'n-other@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-000000000021', 'NOwner'),
  ('00000000-0000-0000-0000-000000000022', 'NApplicant'),
  ('00000000-0000-0000-0000-000000000023', 'NOther');

select tests.login('00000000-0000-0000-0000-000000000021');
create temporary table t_ng as select * from public.create_group('Notify group');
grant select on t_ng to anon, authenticated;
create temporary table t_ninv as select * from public.create_invitation((select id from t_ng));
grant select on t_ninv to anon, authenticated;

-- Before applying, the owner cannot see the applicant's profile.
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000022'), 0::bigint,
  'the owner cannot read a stranger profile');

-- Applicant applies: owner is notified and can now read the applicant's name.
select tests.login('00000000-0000-0000-0000-000000000022');
create temporary table t_nreq as select * from public.redeem_invitation((select token from t_ninv), 'hello');
grant select on t_nreq to anon, authenticated;

select tests.login('00000000-0000-0000-0000-000000000021');
select is((select count(*) from public.notifications where kind = 'membership_requested' and read_at is null), 1::bigint,
  'the owner has an unread membership request notification');
select is((select actor_name from public.my_notifications() limit 1), 'NApplicant',
  'my_notifications resolves the applicant name');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000022'), 'NApplicant',
  'the owner can read the applicant profile once a request exists');

-- Others see nothing.
select tests.login('00000000-0000-0000-0000-000000000023');
select is((select count(*) from public.notifications), 0::bigint, 'a stranger sees no notification');
select is((select count(*) from public.my_notifications()), 0::bigint, 'my_notifications is scoped to the caller');

-- Approval notifies the applicant and settles the owner's notification.
select tests.login('00000000-0000-0000-0000-000000000021');
select lives_ok($$select public.review_membership_request((select id from t_nreq), true)$$, 'owner approves');
select is((select count(*) from public.notifications where kind = 'membership_requested' and read_at is null), 0::bigint,
  'the request notification is marked read after review');

select tests.login('00000000-0000-0000-0000-000000000022');
select is((select kind from public.my_notifications() limit 1), 'request_approved'::public.notification_kind,
  'the applicant is told their request was approved');
select is((select group_name from public.my_notifications() limit 1), 'Notify group', 'the group name is resolved');

-- Photo added by the owner notifies the new member; a want vote notifies the owner.
select tests.logout();
insert into public.clothing_items (id, group_id, uploader_id, storage_path)
values ('30000000-0000-0000-0000-000000000001', (select id from t_ng), '00000000-0000-0000-0000-000000000021',
        (select id from t_ng) || '/00000000-0000-0000-0000-000000000021/n.jpg');
select tests.login('00000000-0000-0000-0000-000000000022');
select is((select count(*) from public.notifications where kind = 'item_added'), 1::bigint, 'members are told about a new photo');
select lives_ok($$select public.cast_vote('30000000-0000-0000-0000-000000000001', 'want')$$, 'member wants the item');
select lives_ok($$select public.cast_vote('30000000-0000-0000-0000-000000000001', 'want')$$, 'repeating the same vote is harmless');
select tests.login('00000000-0000-0000-0000-000000000021');
select is((select count(*) from public.notifications where kind = 'item_wanted'), 1::bigint,
  'the uploader gets exactly one item_wanted notification');

-- Marking read; clients cannot change anything else.
-- Owner's unread: member_joined + item_wanted (the request one was settled by the review).
select is((select public.mark_notifications_read()), 2, 'mark_notifications_read returns the number of rows updated');
select is((select count(*) from public.notifications where read_at is null), 0::bigint, 'nothing is left unread');

select * from finish();
rollback;
