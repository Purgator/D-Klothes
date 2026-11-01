-- Shared setup for pgTAP tests: a schema with role-switching helpers. Runs first (alphabetical order).
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);

create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Impersonate a signed-in user: PostgREST sets the role and the JWT claims the same way.
create or replace function tests.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end;
$$;
create or replace function tests.anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
-- Back to the superuser that runs the tests.
create or replace function tests.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on function tests.login(uuid), tests.anon(), tests.logout() to anon, authenticated;

select ok(true, 'test helpers installed');
select * from finish();
commit;
