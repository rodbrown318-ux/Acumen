-- Job-alerts poll: every 30 minutes, match newly-open shifts to caregivers'
-- saved searches and email them. Uses the same Vault secrets as the Operations
-- cron (project_url, service_role_key). Extensions are already created by
-- 20260709020000_operations_agent_cron.sql.
--
-- To onboard another tenant's alerts, add another cron.schedule(...) block with
-- that tenant's slug in the x-tenant-slug header.

select
  cron.schedule(
    'job-alerts-poll-complete-staffing',
    '*/30 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/alerts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'x-tenant-slug', 'complete-staffing'
        ),
        body := jsonb_build_object('action', 'pollAlerts', 'payload', '{}'::jsonb)
      );
    $$
  );
