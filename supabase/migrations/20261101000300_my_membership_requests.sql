-- An applicant cannot read the group row before approval, but they already saw the group
-- name on the invitation page. This RPC returns the caller's own requests with that name only.
create or replace function public.my_membership_requests()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  message text,
  status public.request_status,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select r.id, r.group_id, g.name, r.message, r.status, r.created_at, r.reviewed_at
  from public.membership_requests r
  join public.groups g on g.id = r.group_id
  where r.user_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.my_membership_requests() from public;
grant execute on function public.my_membership_requests() to authenticated;
