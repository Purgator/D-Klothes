-- Daily retention cleanup through pg_cron + pg_net calling the retention-cleanup Edge Function.
-- The function URL and shared secret are read from Vault so nothing sensitive lives in migrations:
--   select vault.create_secret('https://<project>.supabase.co/functions/v1/retention-cleanup', 'retention_cleanup_url');
--   select vault.create_secret('<same value as RETENTION_CLEANUP_SECRET>', 'retention_cleanup_secret');
-- Until both secrets exist the job logs a notice and does nothing.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.run_retention_cleanup()
returns void
language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  url text;
  secret text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'retention_cleanup_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'retention_cleanup_secret';
  if url is null or secret is null then
    raise notice 'retention cleanup skipped: vault secrets retention_cleanup_url / retention_cleanup_secret missing';
    return;
  end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.run_retention_cleanup() from public;

select cron.schedule('dklothes-retention-cleanup', '17 3 * * *', $$select public.run_retention_cleanup();$$);
