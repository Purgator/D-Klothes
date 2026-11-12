-- Notification kinds for the ownership offer (next migration). Added in their own file:
-- a new enum value cannot be used in the transaction that creates it.
alter type public.notification_kind add value if not exists 'ownership_offered';   -- to the member the group is offered to
alter type public.notification_kind add value if not exists 'ownership_accepted';  -- to the previous owner
alter type public.notification_kind add value if not exists 'ownership_declined';  -- to the owner
