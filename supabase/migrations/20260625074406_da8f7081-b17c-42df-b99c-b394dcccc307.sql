CREATE OR REPLACE FUNCTION public.ai_score_daily()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '0'
AS $function$
DECLARE _d date; _p public.ai_params; _base numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_top_patterns LIMIT 1) THEN RETURN; END IF;
  SELECT * INTO _p FROM public.ai_params WHERE id=1;
  SELECT max(snapshot_date) INTO _d FROM public.daily_snapshots;
  IF _d IS NULL THEN RETURN; END IF;
  SELECT round(max(base_rate_pct),2) INTO _base FROM public.ai_patterns WHERE target_key='g20';
  _base := coalesce(_base,0);

  DELETE FROM public.ai_watchlist WHERE score_date = _d;

  CREATE TEMP TABLE tfeat ON COMMIT DROP AS
  WITH roll AS (
    SELECT ds.symbol, ds.snapshot_date, ds.day_index, ds.close, ds.daily_return_pct ret,
      ds.vol_ratio_1d vr1, ds.vol_ratio_2d vr2, ds.vol_ratio_3d vr3, ds.vol_ratio_5d vr5, ds.vol_ratio_20d vr20,
      ds.ret_2d, ds.ret_3d, ds.ret_5d, ds.ret_10d, ds.ret_20d,
      ds.daily_traded_value tv, ds.market_value mcap, ds.kap_count,
      avg(ds.close) OVER w20 ma20, max(ds.close) OVER w20 hi20, min(ds.close) OVER w20 lo20,
      stddev_samp(ds.daily_return_pct) OVER w20 vol20, s.sector
    FROM public.daily_snapshots ds JOIN public.stocks s ON s.symbol = ds.symbol
    WINDOW w20 AS (PARTITION BY ds.symbol ORDER BY ds.day_index ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
  ),
  grp AS (
    SELECT *,
      sum(CASE WHEN ret>0 THEN 0 ELSE 1 END) OVER (PARTITION BY symbol ORDER BY day_index) g_grp,
      sum(CASE WHEN ret<0 THEN 0 ELSE 1 END) OVER (PARTITION BY symbol ORDER BY day_index) r_grp
    FROM roll
  ),
  st AS (
    SELECT *,
      CASE WHEN ret>0 THEN count(*) OVER (PARTITION BY symbol,g_grp ORDER BY day_index) ELSE 0 END green_streak,
      CASE WHEN ret<0 THEN count(*) OVER (PARTITION BY symbol,r_grp ORDER BY day_index) ELSE 0 END red_streak
    FROM grp
  ),
  cur AS (SELECT * FROM st WHERE snapshot_date = _d),
  secst AS (
    SELECT sector, percentile_cont(0.5) WITHIN GROUP (ORDER BY ret_20d) med,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY ret_20d) p75
    FROM cur WHERE sector IS NOT NULL GROUP BY sector
  )
  SELECT c.symbol, c.sector,
    c.close, c.vr1,c.vr2,c.vr3,c.vr5,c.vr20, c.ret_2d,c.ret_3d,c.ret_5d,c.ret_10d,c.ret_20d,
    c.tv,c.mcap,c.kap_count,c.green_streak,c.red_streak,
    CASE WHEN c.ma20>0 THEN (c.close/c.ma20-1)*100 END dist_ma20,
    CASE WHEN c.hi20>0 THEN (c.close/c.hi20-1)*100 END dist_hi20,
    CASE WHEN c.lo20>0 THEN (c.close/c.lo20-1)*100 END dist_lo20,
    CASE WHEN c.close>0 THEN (c.hi20-c.lo20)/c.close*100 END range20,
    c.vol20, ss.med sec_med_ret20, ss.p75 sec_p75_ret20
  FROM cur c LEFT JOIN secst ss ON ss.sector = c.sector;

  CREATE TEMP TABLE tflags ON COMMIT DROP AS
  SELECT f.symbol, p.pred_key FROM tfeat f
  CROSS JOIN LATERAL (VALUES
    ('vr1_ge1_5', f.vr1 >= 1.5),('vr1_ge2', f.vr1 >= 2),
    ('vr2_ge1_5', f.vr2 >= 1.5),('vr2_ge2', f.vr2 >= 2),
    ('vr3_ge1_5', f.vr3 >= 1.5),('vr3_ge2', f.vr3 >= 2),
    ('vr5_ge1_5', f.vr5 >= 1.5),('vr5_ge2', f.vr5 >= 2),
    ('vr20_ge2', f.vr20 >= 2),('vr20_ge3', f.vr20 >= 3),('vr20_ge5', f.vr20 >= 5),
    ('vol_accel', f.vr5 > 0 AND f.vr1 >= f.vr5 * 1.5),
    ('tv_top20', f.tv >= _p.tv80),('tv_top10', f.tv >= _p.tv90),
    ('mcap_small', f.mcap < _p.mcap_med),('mcap_micro', f.mcap < _p.mcap_p20),
    ('vol_high', f.vol20 >= _p.vol75),('vol_low', f.vol20 <= _p.vol25),
    ('above_ma20', f.dist_ma20 > 0),('far_above_ma20', f.dist_ma20 >= 10),
    ('near_ma20', abs(f.dist_ma20) <= 3),('below_ma20', f.dist_ma20 < 0),
    ('near_high20', f.dist_hi20 >= -3),('new_high20', f.dist_hi20 >= 0),
    ('off_low20', f.dist_lo20 >= 20),('near_low20', f.dist_lo20 <= 5),
    ('ret2_ge2', f.ret_2d >= 2),('ret3_ge3', f.ret_3d >= 3),
    ('ret5_ge5', f.ret_5d >= 5),('ret5_pos', f.ret_5d > 0),('ret5_neg', f.ret_5d < 0),
    ('ret10_ge10', f.ret_10d >= 10),('ret10_pos', f.ret_10d > 0),
    ('green_ge2', f.green_streak >= 2),('green_ge3', f.green_streak >= 3),
    ('red_ge2', f.red_streak >= 2),('red_ge3', f.red_streak >= 3),
    ('consolidating', f.range20 <= 10),
    ('rs_pos', f.ret_20d > f.sec_med_ret20),('rs_strong', f.ret_20d >= f.sec_p75_ret20),
    ('kap_present', f.kap_count >= 1),('kap_2plus', f.kap_count >= 2)
  ) p(pred_key, present)
  WHERE p.present;
  INSERT INTO tflags SELECT symbol, 'sector:' || sector FROM tfeat WHERE sector IS NOT NULL;

  CREATE TEMP TABLE tmatch ON COMMIT DROP AS
  SELECT tf.symbol, tp.id pattern_id, tp.target_key, tp.precision_pct, tp.ci_low, tp.label
  FROM public.ai_top_patterns tp
  JOIN tflags tf ON tf.pred_key = ANY(tp.pred_keys)
  WHERE coalesce(tp.robust,false) OR coalesce(tp.overfit,true) = false
  GROUP BY tf.symbol, tp.id, tp.target_key, tp.precision_pct, tp.ci_low, tp.label, tp.n_preds
  HAVING count(*) = tp.n_preds;

  INSERT INTO public.ai_watchlist(score_date,symbol,company_name,sector,probability,confidence,
    matched_patterns,matched_labels,best_target,hist_success_pct,rank)
  SELECT _d, m.symbol, s.company_name, s.sector,
    round(max(m.precision_pct),2), round(max(m.ci_low),2),
    count(*), (array_agg(m.label ORDER BY m.precision_pct DESC NULLS LAST))[1:5],
    (array_agg(m.target_key ORDER BY m.precision_pct DESC NULLS LAST))[1],
    round(avg(m.precision_pct),2), 0
  FROM tmatch m LEFT JOIN public.stocks s ON s.symbol = m.symbol
  GROUP BY m.symbol, s.company_name, s.sector;

  INSERT INTO public.ai_watchlist(score_date,symbol,company_name,sector,probability,confidence,
    matched_patterns,matched_labels,best_target,hist_success_pct,rank)
  SELECT _d, f.symbol, s.company_name, s.sector,
    _base, 0, 0, NULL::text[], 'base', _base, 0
  FROM tfeat f LEFT JOIN public.stocks s ON s.symbol = f.symbol
  WHERE f.symbol NOT IN (SELECT symbol FROM tmatch);

  UPDATE public.ai_watchlist w SET rank = x.r
  FROM (SELECT id, row_number() OVER (ORDER BY probability DESC NULLS LAST, confidence DESC NULLS LAST, matched_patterns DESC) r
        FROM public.ai_watchlist WHERE score_date=_d) x
  WHERE w.id = x.id;
END$function$;