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
    SELECT _db, ord, metric, round(med::numeric,4), round(av::numeric,4), unit FROM (
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
    round(avg_fwd::numeric,2)
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