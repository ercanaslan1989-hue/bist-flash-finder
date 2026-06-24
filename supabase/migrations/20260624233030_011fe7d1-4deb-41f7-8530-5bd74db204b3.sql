-- ============ schema additions ============
ALTER TABLE public.daily_snapshots
  ADD COLUMN IF NOT EXISTS ret_2d numeric,
  ADD COLUMN IF NOT EXISTS ret_3d numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_1d numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_5d numeric,
  ADD COLUMN IF NOT EXISTS fwd_max_20d numeric;

ALTER TABLE public.event_features
  ADD COLUMN IF NOT EXISTS ret_2d numeric,
  ADD COLUMN IF NOT EXISTS ret_3d numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_1d numeric,
  ADD COLUMN IF NOT EXISTS vol_ratio_5d numeric;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS fwd_ret_20d numeric;

-- allow a symbol/day to carry both a limit_up and a run_20 event
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_symbol_event_date_key;
ALTER TABLE public.events
  ADD CONSTRAINT events_symbol_event_date_type_key UNIQUE (symbol, event_date, event_type);

CREATE INDEX IF NOT EXISTS idx_snapshots_symbol_dayidx
  ON public.daily_snapshots (symbol, day_index);

-- ============ progress + queue + signals tables ============
CREATE TABLE IF NOT EXISTS public.research_progress (
  id int PRIMARY KEY DEFAULT 1,
  scope_start date,
  scope_end date,
  phase text,
  status text NOT NULL DEFAULT 'idle',
  stocks_total int NOT NULL DEFAULT 0,
  stocks_done int NOT NULL DEFAULT 0,
  rows_processed bigint NOT NULL DEFAULT 0,
  limit_up_events int NOT NULL DEFAULT 0,
  run20_events int NOT NULL DEFAULT 0,
  features_generated int NOT NULL DEFAULT 0,
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_progress_singleton CHECK (id = 1)
);
GRANT SELECT ON public.research_progress TO anon, authenticated;
GRANT ALL ON public.research_progress TO service_role;
ALTER TABLE public.research_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "research_progress public read" ON public.research_progress;
CREATE POLICY "research_progress public read" ON public.research_progress FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.research_queue (
  symbol text PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending',
  n_rows int NOT NULL DEFAULT 0,
  limit_up int NOT NULL DEFAULT 0,
  run20 int NOT NULL DEFAULT 0,
  processed_at timestamptz,
  error text
);
GRANT SELECT ON public.research_queue TO anon, authenticated;
GRANT ALL ON public.research_queue TO service_role;
ALTER TABLE public.research_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "research_queue public read" ON public.research_queue;
CREATE POLICY "research_queue public read" ON public.research_queue FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.research_signals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type text NOT NULL,
  horizon int NOT NULL,
  signal_key text NOT NULL,
  signal_label text NOT NULL,
  support bigint NOT NULL DEFAULT 0,
  hits bigint NOT NULL DEFAULT 0,
  base_support bigint NOT NULL DEFAULT 0,
  base_hits bigint NOT NULL DEFAULT 0,
  precision_pct numeric,
  base_rate_pct numeric,
  lift numeric,
  avg_fwd_max20 numeric,
  rank int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.research_signals TO anon, authenticated;
GRANT ALL ON public.research_signals TO service_role;
ALTER TABLE public.research_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "research_signals public read" ON public.research_signals;
CREATE POLICY "research_signals public read" ON public.research_signals FOR SELECT USING (true);

-- ============ drop old engine ============
DROP FUNCTION IF EXISTS public.run_recompute_once();
DROP FUNCTION IF EXISTS public.recompute_research();

-- ============ per-stock processor (phases 1-5) ============
CREATE OR REPLACE FUNCTION public.process_stock(_symbol text)
RETURNS TABLE(rows_done int, lu int, run20 int, feats int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _scope date;
BEGIN
  SELECT scope_start INTO _scope FROM public.research_progress WHERE id = 1;
  IF _scope IS NULL THEN _scope := DATE '2025-01-01'; END IF;

  -- Phase 1-3: day_index, returns, volume ratios, forward 20d max, value columns
  WITH calc AS (
    SELECT ds.id,
      row_number() OVER w AS rn,
      (ds.close / NULLIF(lag(ds.close,1)  OVER w,0) - 1) * 100 AS dr,
      (ds.close / NULLIF(lag(ds.close,2)  OVER w,0) - 1) * 100 AS r2,
      (ds.close / NULLIF(lag(ds.close,3)  OVER w,0) - 1) * 100 AS r3,
      (ds.close / NULLIF(lag(ds.close,5)  OVER w,0) - 1) * 100 AS r5,
      (ds.close / NULLIF(lag(ds.close,10) OVER w,0) - 1) * 100 AS r10,
      (ds.close / NULLIF(lag(ds.close,20) OVER w,0) - 1) * 100 AS r20,
      (ds.close / NULLIF(lag(ds.close,30) OVER w,0) - 1) * 100 AS r30,
      ds.volume::numeric / NULLIF(lag(ds.volume,1) OVER w,0) AS vr1,
      ds.volume::numeric / NULLIF(avg(ds.volume) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date ROWS BETWEEN 2  PRECEDING AND 1 PRECEDING),0) AS vr2,
      ds.volume::numeric / NULLIF(avg(ds.volume) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date ROWS BETWEEN 3  PRECEDING AND 1 PRECEDING),0) AS vr3,
      ds.volume::numeric / NULLIF(avg(ds.volume) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date ROWS BETWEEN 5  PRECEDING AND 1 PRECEDING),0) AS vr5,
      ds.volume::numeric / NULLIF(avg(ds.volume) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING),0) AS vr20,
      (max(ds.close) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date ROWS BETWEEN 1 FOLLOWING AND 20 FOLLOWING) / NULLIF(ds.close,0) - 1) * 100 AS fmax20,
      ds.close AS cl, ds.volume AS vol, s.shares_outstanding AS so
    FROM public.daily_snapshots ds
    LEFT JOIN public.stocks s ON s.symbol = ds.symbol
    WHERE ds.symbol = _symbol
    WINDOW w AS (PARTITION BY ds.symbol ORDER BY ds.snapshot_date)
  )
  UPDATE public.daily_snapshots ds SET
    day_index = calc.rn,
    daily_return_pct = round(calc.dr,4),
    ret_2d = round(calc.r2,4), ret_3d = round(calc.r3,4),
    ret_5d = round(calc.r5,4), ret_10d = round(calc.r10,4),
    ret_20d = round(calc.r20,4), ret_30d = round(calc.r30,4),
    vol_ratio_1d = round(calc.vr1,4), vol_ratio_2d = round(calc.vr2,4),
    vol_ratio_3d = round(calc.vr3,4), vol_ratio_5d = round(calc.vr5,4),
    vol_ratio_20d = round(calc.vr20,4),
    fwd_max_20d = round(calc.fmax20,4),
    market_value = round(calc.cl * calc.so, 2),
    daily_traded_value = round(calc.cl * calc.vol, 2)
  FROM calc WHERE calc.id = ds.id;
  GET DIAGNOSTICS rows_done = ROW_COUNT;

  -- Phase 4: events (rebuild for this symbol only)
  DELETE FROM public.event_features ef USING public.events e
    WHERE ef.event_id = e.id AND e.symbol = _symbol;
  DELETE FROM public.events WHERE symbol = _symbol;

  -- +10% daily limit-up events within scope
  INSERT INTO public.events(symbol, event_date, event_type, is_limit_up, daily_return_pct, fwd_ret_20d, sector)
  SELECT ds.symbol, ds.snapshot_date, 'limit_up', true, ds.daily_return_pct, ds.fwd_max_20d, s.sector
  FROM public.daily_snapshots ds
  JOIN public.stocks s ON s.symbol = ds.symbol
  WHERE ds.symbol = _symbol AND ds.snapshot_date >= _scope AND ds.daily_return_pct >= 9.5
  ON CONFLICT (symbol, event_date, event_type) DO NOTHING;

  -- +20% within following 20 trading days: launch day of each distinct run
  INSERT INTO public.events(symbol, event_date, event_type, is_limit_up, daily_return_pct, fwd_ret_20d, sector)
  SELECT q.symbol, q.snapshot_date, 'run_20', false, q.daily_return_pct, q.fwd_max_20d, s.sector
  FROM (
    SELECT ds.*,
      lag(ds.fwd_max_20d >= 20) OVER (PARTITION BY ds.symbol ORDER BY ds.snapshot_date) AS prev_q
    FROM public.daily_snapshots ds
    WHERE ds.symbol = _symbol
  ) q
  JOIN public.stocks s ON s.symbol = q.symbol
  WHERE q.snapshot_date >= _scope AND q.fwd_max_20d >= 20 AND (q.prev_q IS DISTINCT FROM true)
  ON CONFLICT (symbol, event_date, event_type) DO NOTHING;

  SELECT count(*) FILTER (WHERE event_type = 'limit_up'),
         count(*) FILTER (WHERE event_type = 'run_20')
    INTO lu, run20
  FROM public.events WHERE symbol = _symbol;

  -- Phase 5: pre-event features at 1,2,3,5,10 trading days before
  INSERT INTO public.event_features(
    event_id, symbol, days_before, feature_date, close, daily_return_pct, volume,
    vol_ratio_1d, vol_ratio_2d, vol_ratio_3d, vol_ratio_5d, vol_ratio_20d,
    ret_2d, ret_3d, ret_5d, ret_10d, ret_20d, ret_30d,
    market_value, daily_traded_value, kap_count, sector)
  SELECT e.id, e.symbol, db.days_before, s2.snapshot_date, s2.close, s2.daily_return_pct, s2.volume,
    s2.vol_ratio_1d, s2.vol_ratio_2d, s2.vol_ratio_3d, s2.vol_ratio_5d, s2.vol_ratio_20d,
    s2.ret_2d, s2.ret_3d, s2.ret_5d, s2.ret_10d, s2.ret_20d, s2.ret_30d,
    s2.market_value, s2.daily_traded_value, s2.kap_count, e.sector
  FROM public.events e
  JOIN public.daily_snapshots s1 ON s1.symbol = e.symbol AND s1.snapshot_date = e.event_date
  CROSS JOIN (VALUES (1),(2),(3),(5),(10)) AS db(days_before)
  JOIN public.daily_snapshots s2 ON s2.symbol = e.symbol AND s2.day_index = s1.day_index - db.days_before
  WHERE e.symbol = _symbol
  ON CONFLICT (event_id, days_before) DO NOTHING;
  GET DIAGNOSTICS feats = ROW_COUNT;

  RETURN NEXT;
END$$;
REVOKE EXECUTE ON FUNCTION public.process_stock(text) FROM PUBLIC, anon, authenticated;

-- ============ reset / initialise the run ============
CREATE OR REPLACE FUNCTION public.research_reset(_scope date DEFAULT DATE '2025-01-01')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  TRUNCATE public.event_features;
  TRUNCATE public.events;
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

-- ============ phase 6: statistical + signal-ranking tables ============
CREATE OR REPLACE FUNCTION public.build_research_aggregates()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _db int;
  _scope date;
  _tv80 numeric;
  _mcap_med numeric;
BEGIN
  SELECT scope_start INTO _scope FROM public.research_progress WHERE id = 1;
  IF _scope IS NULL THEN _scope := DATE '2025-01-01'; END IF;

  TRUNCATE public.research_window_stats;
  TRUNCATE public.research_profile;
  TRUNCATE public.research_sectors;
  TRUNCATE public.research_signals;

  FOREACH _db IN ARRAY ARRAY[0,1,2,3,5,10] LOOP
    INSERT INTO public.research_window_stats(days_before,chart,ord,label,count,pct)
    WITH f AS (SELECT vol_ratio_20d v FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db,'volume',ord,label,c, CASE WHEN tot>0 THEN round(c*100.0/tot,2) ELSE 0 END FROM (
      SELECT 1 ord,'< 1×' label, count(*) FILTER (WHERE v<1) c, count(v) tot FROM f
      UNION ALL SELECT 2,'1–1.5×', count(*) FILTER (WHERE v>=1 AND v<1.5), count(v) FROM f
      UNION ALL SELECT 3,'1.5–2×', count(*) FILTER (WHERE v>=1.5 AND v<2), count(v) FROM f
      UNION ALL SELECT 4,'2–3×', count(*) FILTER (WHERE v>=2 AND v<3), count(v) FROM f
      UNION ALL SELECT 5,'3–5×', count(*) FILTER (WHERE v>=3 AND v<5), count(v) FROM f
      UNION ALL SELECT 6,'5×+', count(*) FILTER (WHERE v>=5), count(v) FROM f
    ) q;

    INSERT INTO public.research_window_stats(days_before,chart,ord,label,count,pct)
    WITH f AS (SELECT kap_count v FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db,'kap',ord,label,c, CASE WHEN tot>0 THEN round(c*100.0/tot,2) ELSE 0 END FROM (
      SELECT 1 ord,'0' label, count(*) FILTER (WHERE v=0) c, count(v) tot FROM f
      UNION ALL SELECT 2,'1', count(*) FILTER (WHERE v=1), count(v) FROM f
      UNION ALL SELECT 3,'2', count(*) FILTER (WHERE v=2), count(v) FROM f
      UNION ALL SELECT 4,'3+', count(*) FILTER (WHERE v>=3), count(v) FROM f
    ) q;

    INSERT INTO public.research_window_stats(days_before,chart,ord,label,count,pct)
    WITH f AS (SELECT ret_5d v FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db,'ret5',ord,label,c, CASE WHEN tot>0 THEN round(c*100.0/tot,2) ELSE 0 END FROM (
      SELECT 1 ord,'< -5%' label, count(*) FILTER (WHERE v < -5) c, count(v) tot FROM f
      UNION ALL SELECT 2,'-5–0%', count(*) FILTER (WHERE v>=-5 AND v<0), count(v) FROM f
      UNION ALL SELECT 3,'0–5%', count(*) FILTER (WHERE v>=0 AND v<5), count(v) FROM f
      UNION ALL SELECT 4,'5–10%', count(*) FILTER (WHERE v>=5 AND v<10), count(v) FROM f
      UNION ALL SELECT 5,'10–20%', count(*) FILTER (WHERE v>=10 AND v<20), count(v) FROM f
      UNION ALL SELECT 6,'20%+', count(*) FILTER (WHERE v>=20), count(v) FROM f
    ) q;

    INSERT INTO public.research_window_stats(days_before,chart,ord,label,count,pct)
    WITH f AS (SELECT ret_10d v FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db,'ret10',ord,label,c, CASE WHEN tot>0 THEN round(c*100.0/tot,2) ELSE 0 END FROM (
      SELECT 1 ord,'< -5%' label, count(*) FILTER (WHERE v < -5) c, count(v) tot FROM f
      UNION ALL SELECT 2,'-5–0%', count(*) FILTER (WHERE v>=-5 AND v<0), count(v) FROM f
      UNION ALL SELECT 3,'0–5%', count(*) FILTER (WHERE v>=0 AND v<5), count(v) FROM f
      UNION ALL SELECT 4,'5–10%', count(*) FILTER (WHERE v>=5 AND v<10), count(v) FROM f
      UNION ALL SELECT 5,'10–20%', count(*) FILTER (WHERE v>=10 AND v<20), count(v) FROM f
      UNION ALL SELECT 6,'20%+', count(*) FILTER (WHERE v>=20), count(v) FROM f
    ) q;

    INSERT INTO public.research_profile(days_before,ord,metric,median,average,unit)
    WITH f AS (SELECT * FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db, ord, metric, round(med,4), round(av,4), unit FROM (
      SELECT 1 ord,'Volume ratio (1d vs prev)' metric, percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_1d::numeric) med, avg(vol_ratio_1d) av, 'ratio' unit FROM f
      UNION ALL SELECT 2,'Volume ratio (prev 2d)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_2d::numeric), avg(vol_ratio_2d),'ratio' FROM f
      UNION ALL SELECT 3,'Volume ratio (prev 3d)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_3d::numeric), avg(vol_ratio_3d),'ratio' FROM f
      UNION ALL SELECT 4,'Volume ratio (prev 5d)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_5d::numeric), avg(vol_ratio_5d),'ratio' FROM f
      UNION ALL SELECT 5,'Volume ratio (20d avg)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_20d::numeric), avg(vol_ratio_20d),'ratio' FROM f
      UNION ALL SELECT 6,'2-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_2d::numeric), avg(ret_2d),'pct' FROM f
      UNION ALL SELECT 7,'3-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_3d::numeric), avg(ret_3d),'pct' FROM f
      UNION ALL SELECT 8,'5-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_5d::numeric), avg(ret_5d),'pct' FROM f
      UNION ALL SELECT 9,'10-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_10d::numeric), avg(ret_10d),'pct' FROM f
      UNION ALL SELECT 10,'Traded value (₺)', percentile_cont(0.5) WITHIN GROUP (ORDER BY daily_traded_value::numeric), avg(daily_traded_value),'num' FROM f
      UNION ALL SELECT 11,'Market cap (₺)', percentile_cont(0.5) WITHIN GROUP (ORDER BY market_value::numeric), avg(market_value),'num' FROM f
      UNION ALL SELECT 12,'KAP announcements', percentile_cont(0.5) WITHIN GROUP (ORDER BY kap_count::numeric), avg(kap_count),'num' FROM f
    ) q;
  END LOOP;

  INSERT INTO public.research_sectors(ord,label,count,pct)
  SELECT row_number() OVER (ORDER BY count(*) DESC, coalesce(sector,'Unknown')),
         coalesce(sector,'Unknown'), count(*),
         round(count(*)*100.0/NULLIF((SELECT count(*) FROM public.events),0),2)
  FROM public.events GROUP BY coalesce(sector,'Unknown');

  -- ===== signal ranking =====
  SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY daily_traded_value),
         percentile_cont(0.5) WITHIN GROUP (ORDER BY market_value)
    INTO _tv80, _mcap_med
  FROM public.daily_snapshots
  WHERE snapshot_date >= _scope AND daily_traded_value IS NOT NULL;

  WITH ev AS (
    SELECT e.symbol, s.day_index, e.event_type AS etype
    FROM public.events e
    JOIN public.daily_snapshots s ON s.symbol = e.symbol AND s.snapshot_date = e.event_date
  ),
  base AS (
    SELECT b.*,
      max(b.day_index) OVER (PARTITION BY b.symbol) AS max_di,
      lu.gap AS lu_gap, ru.gap AS ru_gap
    FROM (SELECT * FROM public.daily_snapshots WHERE snapshot_date >= _scope) b
    LEFT JOIN LATERAL (SELECT min(e.day_index - b.day_index) gap FROM ev e
                       WHERE e.symbol = b.symbol AND e.etype = 'limit_up' AND e.day_index > b.day_index) lu ON true
    LEFT JOIN LATERAL (SELECT min(e.day_index - b.day_index) gap FROM ev e
                       WHERE e.symbol = b.symbol AND e.etype = 'run_20' AND e.day_index > b.day_index) ru ON true
  ),
  sigs AS (
    SELECT base.*, sig.signal_key, sig.label, sig.present
    FROM base
    CROSS JOIN LATERAL (VALUES
      ('vr20_ge2','Volume ≥ 2× 20-day avg',        (base.vol_ratio_20d >= 2)),
      ('vr20_ge3','Volume ≥ 3× 20-day avg',        (base.vol_ratio_20d >= 3)),
      ('vr5_ge1_5','5-day volume ≥ 1.5× avg',      (base.vol_ratio_5d  >= 1.5)),
      ('vr2_ge2','2-day volume ≥ 2× avg',          (base.vol_ratio_2d  >= 2)),
      ('vr1_ge2','1-day volume ≥ 2× prev day',     (base.vol_ratio_1d  >= 2)),
      ('ret5_ge5','5-day return ≥ +5%',            (base.ret_5d >= 5)),
      ('ret3_ge3','3-day return ≥ +3%',            (base.ret_3d >= 3)),
      ('ret2_ge2','2-day return ≥ +2%',            (base.ret_2d >= 2)),
      ('kap_ge1','KAP disclosure present',         (base.kap_count >= 1)),
      ('tv_top20','Traded value in top 20%',       (base.daily_traded_value >= _tv80)),
      ('mcap_small','Market cap below median',     (base.market_value < _mcap_med))
    ) AS sig(signal_key, label, present)
  )
  INSERT INTO public.research_signals(
    event_type, horizon, signal_key, signal_label,
    support, hits, base_support, base_hits,
    precision_pct, base_rate_pct, lift, avg_fwd_max20)
  SELECT etype, h, signal_key, label, support, hits, base_support, base_hits,
    round(100.0*hits/NULLIF(support,0),2),
    round(100.0*base_hits/NULLIF(base_support,0),2),
    round((100.0*hits/NULLIF(support,0)) / NULLIF(100.0*base_hits/NULLIF(base_support,0),0),3),
    round(avg_fwd,2)
  FROM (
    SELECT et.etype, hz.h, s.signal_key, s.label,
      count(*) FILTER (WHERE s.present AND s.day_index <= s.max_di - hz.h) AS support,
      count(*) FILTER (WHERE s.present AND s.day_index <= s.max_di - hz.h
        AND (CASE et.etype WHEN 'limit_up' THEN s.lu_gap ELSE s.ru_gap END) <= hz.h) AS hits,
      count(*) FILTER (WHERE s.day_index <= s.max_di - hz.h) AS base_support,
      count(*) FILTER (WHERE s.day_index <= s.max_di - hz.h
        AND (CASE et.etype WHEN 'limit_up' THEN s.lu_gap ELSE s.ru_gap END) <= hz.h) AS base_hits,
      avg(s.fwd_max_20d) FILTER (WHERE s.present AND s.day_index <= s.max_di - hz.h) AS avg_fwd
    FROM sigs s
    CROSS JOIN (VALUES ('limit_up'),('run_20')) et(etype)
    CROSS JOIN (VALUES (1),(2),(3),(5)) hz(h)
    GROUP BY et.etype, hz.h, s.signal_key, s.label
  ) q;

  UPDATE public.research_signals rs SET rank = r.rk
  FROM (SELECT id, row_number() OVER (PARTITION BY event_type, horizon
          ORDER BY lift DESC NULLS LAST, precision_pct DESC NULLS LAST) rk
        FROM public.research_signals) r
  WHERE rs.id = r.id;

  -- ===== meta =====
  INSERT INTO public.research_meta(id,stock_count,snapshot_count,event_count,limit_up_count,first_date,last_date,updated_at)
  VALUES (1,
    (SELECT count(*) FROM public.stocks),
    (SELECT count(*) FROM public.daily_snapshots WHERE snapshot_date >= _scope),
    (SELECT count(*) FROM public.events),
    (SELECT count(*) FROM public.events WHERE event_type = 'limit_up'),
    _scope,
    (SELECT max(snapshot_date) FROM public.daily_snapshots),
    now())
  ON CONFLICT (id) DO UPDATE SET
    stock_count=EXCLUDED.stock_count, snapshot_count=EXCLUDED.snapshot_count,
    event_count=EXCLUDED.event_count, limit_up_count=EXCLUDED.limit_up_count,
    first_date=EXCLUDED.first_date, last_date=EXCLUDED.last_date, updated_at=now();

  UPDATE public.research_progress
    SET features_generated = (SELECT count(*) FROM public.event_features), updated_at = now()
    WHERE id = 1;
END$$;
REVOKE EXECUTE ON FUNCTION public.build_research_aggregates() FROM PUBLIC, anon, authenticated;

-- ============ resumable driver (commits after every stock) ============
CREATE OR REPLACE PROCEDURE public.research_drive(_batch int DEFAULT 50)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sym text; _n int := 0; _r int; _lu int; _ru int; _f int; _rem int;
BEGIN
  IF NOT pg_try_advisory_lock(778899) THEN RETURN; END IF;

  UPDATE public.research_progress
    SET status='running', phase='Phase 1-5: per-stock compute', updated_at=now()
    WHERE id=1 AND status <> 'done';

  LOOP
    EXIT WHEN _n >= _batch;
    SELECT symbol INTO _sym FROM public.research_queue
      WHERE status='pending' ORDER BY symbol FOR UPDATE SKIP LOCKED LIMIT 1;
    EXIT WHEN _sym IS NULL;

    UPDATE public.research_queue SET status='processing' WHERE symbol=_sym;
    SELECT rows_done, lu, run20, feats INTO _r,_lu,_ru,_f FROM public.process_stock(_sym);
    UPDATE public.research_queue
      SET status='done', n_rows=_r, limit_up=_lu, run20=_ru, processed_at=now(), error=NULL
      WHERE symbol=_sym;

    UPDATE public.research_progress SET
      stocks_done = stocks_done + 1,
      rows_processed = rows_processed + _r,
      limit_up_events = limit_up_events + _lu,
      run20_events = run20_events + _ru,
      features_generated = features_generated + _f,
      updated_at = now()
    WHERE id=1;

    COMMIT;
    _n := _n + 1;
  END LOOP;

  SELECT count(*) INTO _rem FROM public.research_queue WHERE status <> 'done';
  IF _rem = 0 THEN
    UPDATE public.research_progress SET phase='Phase 6: building research tables', updated_at=now() WHERE id=1;
    COMMIT;
    PERFORM public.build_research_aggregates();
    UPDATE public.research_progress SET status='done', phase='Complete', updated_at=now() WHERE id=1;
    COMMIT;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='research_drive') THEN
      PERFORM cron.unschedule('research_drive');
    END IF;
  END IF;

  PERFORM pg_advisory_unlock(778899);
END$$;
REVOKE EXECUTE ON PROCEDURE public.research_drive(int) FROM PUBLIC, anon, authenticated;