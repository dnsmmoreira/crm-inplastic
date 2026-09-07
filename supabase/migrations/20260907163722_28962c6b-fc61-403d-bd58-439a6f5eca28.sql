ALTER TABLE public.user_audit_log ALTER COLUMN alvo_user_id DROP NOT NULL;

SELECT cron.unschedule('documentos-expurgo-diario')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'documentos-expurgo-diario');

SELECT cron.schedule(
  'documentos-expurgo-diario',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app/api/public/hooks/documentos-expurgo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-xerife-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'XERIFE_SECRET')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);