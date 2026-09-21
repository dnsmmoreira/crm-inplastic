select cron.alter_job(
  job_id := 10,
  command := $cmd$
  SELECT net.http_post(
    url := 'https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app/api/public/hooks/xerife-pedidos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-xerife-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'XERIFE_SECRET')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  ) AS request_id;
$cmd$
);