CREATE OR REPLACE FUNCTION public.research_reset(_scope date DEFAULT DATE '2025-01-01')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  TRUNCATE public.event_features, public.events;
  TRUNCATE public.research_window_stats;
  TRUNCATE public.research_profile;
  TRUNCATE public.research_sectors;
  TRUNCATE public.research_signals;
  DELETE FROM public.research_queue;
  INSERT INTO public.research_queue(symbol, status)
    SELECT symbol, 'pending' FROM public.stocks;

  INSERT INTO public.research_progress(
    id, scope_start, scope_end, phase, status, stocks_total, stocks_done,
    rows_processed, limit_up_events, run20_events, features_generated, started_at, updated_at)
  VALUES (1, _scope, (SELECT max(snapshot_date) FROM public.daily_snapshots),
    'Queued', 'running', (SELECT count(*) FROM public.stocks), 0, 0, 0, 0, 0, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    scope_start = EXCLUDED.scope_start, scope_end = EXCLUDED.scope_end,
    phase = 'Queued', status = 'running', stocks_total = EXCLUDED.stocks_total,
    stocks_done = 0, rows_processed = 0, limit_up_events = 0, run20_events = 0,
    features_generated = 0, started_at = now(), updated_at = now();
END$$;
REVOKE EXECUTE ON FUNCTION public.research_reset(date) FROM PUBLIC, anon, authenticated;