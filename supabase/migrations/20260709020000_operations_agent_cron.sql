-- Schedules the Operations Agent's 15-minute poll via pg_cron + pg_net.
--
-- Before this migration will work, two secrets must exist in Supabase
-- Vault (SQL editor, once per project — these are project credentials, not
-- something a migration file should ever hardcode):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service-role-key>', 'service_role_key');
--
-- To onboard a new tenant's Operations Agent polling, add another
-- cron.schedule(...) block below with that tenant's slug in the
-- x-tenant-slug header -- no code changes required.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select
  cron.schedule(
    'operations-agent-poll-complete-staffing',
    '*/15 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/operations',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'x-tenant-slug', 'complete-staffing'
        ),
        body := jsonb_build_object('action', 'pollShifts', 'payload', '{}'::jsonb)
      );
    $$
  );
