DO $do$
DECLARE
  r RECORD;
  novo TEXT;
BEGIN
  FOR r IN SELECT jobid, command FROM cron.job WHERE jobid BETWEEN 2 AND 9 ORDER BY jobid LOOP
    novo := regexp_replace(
      r.command,
      $q$\s*'apikey',\s*'sb_publishable_[A-Za-z0-9_-]+',$q$,
      '',
      'g'
    );
    IF novo <> r.command THEN
      PERFORM cron.alter_job(job_id := r.jobid, command := novo);
    END IF;
  END LOOP;
END $do$;