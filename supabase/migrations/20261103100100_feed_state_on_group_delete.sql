-- Deleting a group that still holds photos failed: the cascade removes the items, whose
-- after-delete trigger re-inserted the group's feed-state row, which then violated the
-- foreign key to the group being deleted. Skip the bump once the group is gone.
create or replace function public.bump_group_feed_state()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
begin
  if tg_table_name = 'clothing_items' then
    gid := coalesce(new.group_id, old.group_id);
  elsif tg_table_name = 'votes' then
    gid := public.item_group_id(coalesce(new.item_id, old.item_id));
  end if;
  if gid is not null and exists (select 1 from public.groups where id = gid) then
    insert into public.group_feed_state (group_id, version, updated_at)
    values (gid, 1, now())
    on conflict (group_id) do update
      set version = public.group_feed_state.version + 1, updated_at = now();
  end if;
  return null;
end;
$$;
