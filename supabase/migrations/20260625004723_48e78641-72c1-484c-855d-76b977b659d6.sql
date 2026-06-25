-- Stop the runaway every-minute discovery cron loop and free the advisory lock.
-- The 'ai_discovery_once' job (schedule '* * * * *') relaunches ai_discovery_run()
-- every minute; each run takes longer than a minute and never commits, so the
-- advisory lock 991122 is held continuously and no run can ever finish.

DO $$
DECLARE r record;
BEGIN
  -- Unschedule both discovery cron jobs if present.
  FOR r IN SELECT jobname FROM cron.job WHERE jobname IN ('ai_discovery_once','ai_discovery_monthly')
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;

  -- Terminate any in-flight ai_discovery_run backends so the lock releases.
  PERFORM pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid <> pg_backend_pid()
    AND query = 'SELECT public.ai_discovery_run();';
END$$;