-- Schedule the daily refresh at KST 06:00 (UTC 21:00 the previous day).
-- Verify the timezone behavior in Supabase project settings.

-- Required extensions (Supabase typically supports these in SQL editor)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store secrets in Supabase Vault:
-- project_url, service_role_key

select
  cron.schedule(
    'daily-portfolio-refresh',
    '0 21 * * *',
    $$
      select
        net.http_post(
          url:= (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/refresh-portfolio',
          headers:=jsonb_build_object(
            'Content-type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
          ),
          body:=jsonb_build_object('trigger', 'cron', 'ts', now())
        );
    $$
  );
