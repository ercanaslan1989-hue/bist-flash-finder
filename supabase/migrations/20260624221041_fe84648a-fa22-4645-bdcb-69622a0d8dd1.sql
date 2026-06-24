CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.run_recompute_once()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recompute_research();
  PERFORM cron.unschedule('recompute_once');
END;
$$;

SELECT cron.schedule('recompute_once', '* * * * *', 'SELECT public.run_recompute_once();');