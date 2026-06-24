
-- ============ Meta + aggregate tables ============
CREATE TABLE public.ingestion_meta (
  id int PRIMARY KEY DEFAULT 1,
  data_source text NOT NULL DEFAULT '',
  history_start date,
  last_ingest_at timestamptz,
  notes text,
  CONSTRAINT ingestion_meta_single CHECK (id = 1)
);

CREATE TABLE public.research_meta (
  id int PRIMARY KEY DEFAULT 1,
  stock_count int NOT NULL DEFAULT 0,
  snapshot_count bigint NOT NULL DEFAULT 0,
  event_count int NOT NULL DEFAULT 0,
  limit_up_count int NOT NULL DEFAULT 0,
  first_date date,
  last_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_meta_single CHECK (id = 1)
);

CREATE TABLE public.research_window_stats (
  days_before int NOT NULL,
  chart text NOT NULL,
  ord int NOT NULL,
  label text NOT NULL,
  count int NOT NULL DEFAULT 0,
  pct numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (days_before, chart, ord)
);

CREATE TABLE public.research_profile (
  days_before int NOT NULL,
  ord int NOT NULL,
  metric text NOT NULL,
  median numeric,
  average numeric,
  unit text NOT NULL,
  PRIMARY KEY (days_before, ord)
);

CREATE TABLE public.research_sectors (
  ord int PRIMARY KEY,
  label text NOT NULL,
  count int NOT NULL,
  pct numeric NOT NULL
);

-- ============ Grants ============
GRANT SELECT ON public.ingestion_meta TO anon, authenticated;
GRANT ALL ON public.ingestion_meta TO service_role;
GRANT SELECT ON public.research_meta TO anon, authenticated;
GRANT ALL ON public.research_meta TO service_role;
GRANT SELECT ON public.research_window_stats TO anon, authenticated;
GRANT ALL ON public.research_window_stats TO service_role;
GRANT SELECT ON public.research_profile TO anon, authenticated;
GRANT ALL ON public.research_profile TO service_role;
GRANT SELECT ON public.research_sectors TO anon, authenticated;
GRANT ALL ON public.research_sectors TO service_role;

-- ============ RLS ============
ALTER TABLE public.ingestion_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_window_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read ingestion meta" ON public.ingestion_meta FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read research meta" ON public.research_meta FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read window stats" ON public.research_window_stats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read profile" ON public.research_profile FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public can read sectors" ON public.research_sectors FOR SELECT TO anon, authenticated USING (true);

-- ============ Recompute routine ============
CREATE OR REPLACE FUNCTION public.recompute_research()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _db int;
BEGIN
  -- 1) per-symbol sequential trading-day index
  WITH ord AS (
    SELECT id, row_number() OVER (PARTITION BY symbol ORDER BY snapshot_date) AS rn
    FROM public.daily_snapshots
  )
  UPDATE public.daily_snapshots ds SET day_index = ord.rn
  FROM ord WHERE ord.id = ds.id;

  -- 2) derived metrics (returns + volume ratios) via window functions
  WITH calc AS (
    SELECT id,
      (close / NULLIF(lag(close,1)  OVER w,0) - 1) * 100 AS dr,
      (close / NULLIF(lag(close,5)  OVER w,0) - 1) * 100 AS r5,
      (close / NULLIF(lag(close,10) OVER w,0) - 1) * 100 AS r10,
      (close / NULLIF(lag(close,20) OVER w,0) - 1) * 100 AS r20,
      (close / NULLIF(lag(close,30) OVER w,0) - 1) * 100 AS r30,
      volume::numeric / NULLIF(avg(volume) OVER (PARTITION BY symbol ORDER BY snapshot_date ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING),0) AS vr20,
      volume::numeric / NULLIF(avg(volume) OVER (PARTITION BY symbol ORDER BY snapshot_date ROWS BETWEEN 2 PRECEDING AND 1 PRECEDING),0)  AS vr2,
      volume::numeric / NULLIF(avg(volume) OVER (PARTITION BY symbol ORDER BY snapshot_date ROWS BETWEEN 3 PRECEDING AND 1 PRECEDING),0)  AS vr3
    FROM public.daily_snapshots
    WINDOW w AS (PARTITION BY symbol ORDER BY snapshot_date)
  )
  UPDATE public.daily_snapshots ds
  SET daily_return_pct = round(calc.dr,4),
      ret_5d  = round(calc.r5,4),
      ret_10d = round(calc.r10,4),
      ret_20d = round(calc.r20,4),
      ret_30d = round(calc.r30,4),
      vol_ratio_20d = round(calc.vr20,4),
      vol_ratio_2d  = round(calc.vr2,4),
      vol_ratio_3d  = round(calc.vr3,4)
  FROM calc WHERE calc.id = ds.id;

  -- 3) value columns
  UPDATE public.daily_snapshots ds
  SET market_value = round(ds.close * s.shares_outstanding, 2),
      daily_traded_value = round(ds.close * ds.volume, 2)
  FROM public.stocks s WHERE s.symbol = ds.symbol;

  -- 4) rebuild events
  DELETE FROM public.events;
  INSERT INTO public.events(symbol, event_date, event_type, is_limit_up, daily_return_pct, sector)
  SELECT ds.symbol, ds.snapshot_date,
    CASE WHEN ds.daily_return_pct >= 20 THEN 'gain_20'
         WHEN ds.daily_return_pct >= 15 THEN 'gain_15'
         ELSE 'gain_10' END,
    (ds.daily_return_pct >= 9.5 AND ds.daily_return_pct <= 10.5),
    ds.daily_return_pct,
    s.sector
  FROM public.daily_snapshots ds
  JOIN public.stocks s ON s.symbol = ds.symbol
  WHERE ds.daily_return_pct >= 10
  ON CONFLICT (symbol, event_date) DO NOTHING;

  -- 5) capture pre-event features at 1,2,3,5,10 trading days before
  INSERT INTO public.event_features(
    event_id, symbol, days_before, feature_date, close, daily_return_pct, volume,
    vol_ratio_20d, vol_ratio_2d, vol_ratio_3d, ret_5d, ret_10d, ret_20d, ret_30d,
    market_value, daily_traded_value, kap_count, sector
  )
  SELECT e.id, e.symbol, db.days_before, s2.snapshot_date, s2.close, s2.daily_return_pct, s2.volume,
    s2.vol_ratio_20d, s2.vol_ratio_2d, s2.vol_ratio_3d, s2.ret_5d, s2.ret_10d, s2.ret_20d, s2.ret_30d,
    s2.market_value, s2.daily_traded_value, s2.kap_count, e.sector
  FROM public.events e
  JOIN public.daily_snapshots s1 ON s1.symbol = e.symbol AND s1.snapshot_date = e.event_date
  CROSS JOIN (VALUES (1),(2),(3),(5),(10)) AS db(days_before)
  JOIN public.daily_snapshots s2 ON s2.symbol = e.symbol AND s2.day_index = s1.day_index - db.days_before
  ON CONFLICT (event_id, days_before) DO NOTHING;

  -- 6) refresh aggregate tables
  TRUNCATE public.research_window_stats;
  TRUNCATE public.research_profile;
  TRUNCATE public.research_sectors;

  FOREACH _db IN ARRAY ARRAY[0,1,2,3,5,10] LOOP
    -- volume ratio vs 20d
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

    -- KAP activity
    INSERT INTO public.research_window_stats(days_before,chart,ord,label,count,pct)
    WITH f AS (SELECT kap_count v FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db,'kap',ord,label,c, CASE WHEN tot>0 THEN round(c*100.0/tot,2) ELSE 0 END FROM (
      SELECT 1 ord,'0' label, count(*) FILTER (WHERE v=0) c, count(v) tot FROM f
      UNION ALL SELECT 2,'1', count(*) FILTER (WHERE v=1), count(v) FROM f
      UNION ALL SELECT 3,'2', count(*) FILTER (WHERE v=2), count(v) FROM f
      UNION ALL SELECT 4,'3+', count(*) FILTER (WHERE v>=3), count(v) FROM f
    ) q;

    -- 5-day prior return
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

    -- 10-day prior return
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

    -- profile (median + average)
    INSERT INTO public.research_profile(days_before,ord,metric,median,average,unit)
    WITH f AS (SELECT * FROM public.event_features WHERE (_db = 0 OR days_before = _db))
    SELECT _db, ord, metric, round(med,4), round(av,4), unit FROM (
      SELECT 1 ord,'Volume ratio (20d avg)' metric, percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_20d::numeric) med, avg(vol_ratio_20d) av, 'ratio' unit FROM f
      UNION ALL SELECT 2,'Volume ratio (prev 2d)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_2d::numeric), avg(vol_ratio_2d),'ratio' FROM f
      UNION ALL SELECT 3,'Volume ratio (prev 3d)', percentile_cont(0.5) WITHIN GROUP (ORDER BY vol_ratio_3d::numeric), avg(vol_ratio_3d),'ratio' FROM f
      UNION ALL SELECT 4,'5-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_5d::numeric), avg(ret_5d),'pct' FROM f
      UNION ALL SELECT 5,'10-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_10d::numeric), avg(ret_10d),'pct' FROM f
      UNION ALL SELECT 6,'20-day return', percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_20d::numeric), avg(ret_20d),'pct' FROM f
      UNION ALL SELECT 7,'KAP announcements', percentile_cont(0.5) WITHIN GROUP (ORDER BY kap_count::numeric), avg(kap_count),'num' FROM f
    ) q;
  END LOOP;

  -- sectors (from events)
  INSERT INTO public.research_sectors(ord,label,count,pct)
  SELECT row_number() OVER (ORDER BY count(*) DESC, coalesce(sector,'Unknown')),
         coalesce(sector,'Unknown'), count(*),
         round(count(*)*100.0/NULLIF((SELECT count(*) FROM public.events),0),2)
  FROM public.events GROUP BY coalesce(sector,'Unknown');

  -- meta counts
  INSERT INTO public.research_meta(id,stock_count,snapshot_count,event_count,limit_up_count,first_date,last_date,updated_at)
  VALUES (1,
    (SELECT count(*) FROM public.stocks),
    (SELECT count(*) FROM public.daily_snapshots),
    (SELECT count(*) FROM public.events),
    (SELECT count(*) FROM public.events WHERE is_limit_up),
    (SELECT min(snapshot_date) FROM public.daily_snapshots),
    (SELECT max(snapshot_date) FROM public.daily_snapshots),
    now())
  ON CONFLICT (id) DO UPDATE SET
    stock_count=EXCLUDED.stock_count, snapshot_count=EXCLUDED.snapshot_count,
    event_count=EXCLUDED.event_count, limit_up_count=EXCLUDED.limit_up_count,
    first_date=EXCLUDED.first_date, last_date=EXCLUDED.last_date, updated_at=now();
END;
$fn$;

REVOKE ALL ON FUNCTION public.recompute_research() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_research() TO service_role;
