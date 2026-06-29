-- Finalizer called by the daily-ingest edge function after new snapshots land.
CREATE OR REPLACE FUNCTION public.ai_ingest_finalize()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '0'
AS $function$
DECLARE _ev int; _latest date;
BEGIN
  INSERT INTO public.events (symbol, event_date, event_type, is_limit_up, daily_return_pct, sector)
  SELECT ds.symbol, ds.snapshot_date, 'limit_up', true, ds.daily_return_pct, s.sector
  FROM public.daily_snapshots ds
  JOIN public.stocks s ON s.symbol = ds.symbol
  WHERE ds.daily_return_pct >= 9.5
    AND NOT EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.symbol = ds.symbol AND e.event_date = ds.snapshot_date AND e.event_type = 'limit_up'
    );
  GET DIAGNOSTICS _ev = ROW_COUNT;

  PERFORM public.ai_score_daily();

  SELECT max(snapshot_date) INTO _latest FROM public.daily_snapshots;
  RETURN jsonb_build_object('events_inserted', _ev, 'latest_snapshot', _latest);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_ingest_finalize() TO service_role, authenticated, anon;

-- Outbound HTTP from cron.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the ingestion every weekday at 16:30 UTC (19:30 Europe/Istanbul).
DO $cron$
BEGIN
  PERFORM cron.unschedule('daily-bist-ingest')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-bist-ingest');

  PERFORM cron.schedule(
    'daily-bist-ingest',
    '30 16 * * 1-5',
    $$
    SELECT net.http_post(
      url := 'https://ioefzrzakrkytngoidju.supabase.co/functions/v1/daily-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZWZ6cnpha3JreXRuZ29pZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjc2NjEsImV4cCI6MjA5NzkwMzY2MX0.T2Y9mgz2dOYBSseZ6yGZiPnF4aa6QHVO3HYBPDFcwUk'
      ),
      body := jsonb_build_object('source', 'cron'),
      timeout_milliseconds := 280000
    );
    $$
  );
END;
$cron$;