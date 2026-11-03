-- One "wants your item" notification per person per item. Changing a vote back and forth
-- (or undoing a swipe and redoing it) used to notify the uploader every time.
create or replace function public.notify_item_wanted()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  item public.clothing_items;
begin
  if new.vote = 'want' and (tg_op = 'INSERT' or old.vote <> 'want') then
    select * into item from public.clothing_items where id = new.item_id;
    if not exists (
      select 1 from public.notifications n
      where n.kind = 'item_wanted' and n.item_id = item.id and n.actor_id = new.voter_id
    ) then
      insert into public.notifications (user_id, kind, group_id, item_id, actor_id)
      values (item.uploader_id, 'item_wanted', item.group_id, item.id, new.voter_id);
    end if;
  end if;
  return null;
end;
$$;
