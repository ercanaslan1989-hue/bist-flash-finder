
-- ========================= STAGE: reset =========================
CREATE OR REPLACE FUNCTION public.ai_stage_reset()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _scope date; _run bigint;
BEGIN
  SELECT scope_start INTO _scope FROM public.ai_progress WHERE id=1;
  PERFORM public.refresh_kap_features();

  TRUNCATE public.discovery_features, public.discovery_matrix, public.matrix_flags,
           public.ai_mf, public.ai_combos, public.ai_tstat, public.ai_pred_list,
           public.ai_feature_importance, public.ai_backtest_monthly, public.ai_oos_validation,
           public.ai_top_patterns, public.ai_top_signals, public.ai_pattern_rows, public.ai_patterns;

  DELETE FROM public.ai_symbol_queue;
  INSERT INTO public.ai_symbol_queue(symbol)
    SELECT DISTINCT symbol FROM public.daily_snapshots WHERE snapshot_date >= _scope;

  INSERT INTO public.ai_runs(started_at, status) VALUES (now(),'running') RETURNING id INTO _run;

  UPDATE public.ai_progress SET
    run_id=_run, stage='features', status='running', phase='Building feature matrix',
    rows_total=(SELECT count(*) FROM public.ai_symbol_queue), rows_done=0,
    combos_total=0, combos_done=0, cursor_pos=0, pct=2, eta_seconds=NULL, error=NULL,
    stage_started_at=now(), updated_at=now()
  WHERE id=1;

  UPDATE public.ai_meta SET status='running', phase='Building feature matrix',
    current_run_id=_run, updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: features (per-symbol batch) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_features(_batch int DEFAULT 30)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _scope date; _left int; _done int;
BEGIN
  SELECT scope_start INTO _scope FROM public.ai_progress WHERE id=1;

  CREATE TEMP TABLE b ON COMMIT DROP AS
    SELECT symbol FROM public.ai_symbol_queue WHERE NOT feat_done ORDER BY symbol LIMIT _batch;

  IF EXISTS (SELECT 1 FROM b) THEN
    INSERT INTO public.discovery_features(
      snap_id,symbol,snapshot_date,day_index,sector,close,ret,vr1,vr2,vr3,vr5,vr20,
      ret_2d,ret_3d,ret_5d,ret_10d,ret_20d,tv,mcap,kap_count,ma20,hi20,lo20,vol20,
      green_streak,red_streak,dist_ma20,dist_hi20,dist_lo20,range20,sec_med_ret20,sec_p75_ret20,kap_category)
    WITH roll AS (
      SELECT ds.id snap_id, ds.symbol, ds.snapshot_date, ds.day_index, ds.close, ds.daily_return_pct ret,
        ds.vol_ratio_1d vr1, ds.vol_ratio_2d vr2, ds.vol_ratio_3d vr3, ds.vol_ratio_5d vr5, ds.vol_ratio_20d vr20,
        ds.ret_2d, ds.ret_3d, ds.ret_5d, ds.ret_10d, ds.ret_20d,
        ds.daily_traded_value tv, ds.market_value mcap, ds.kap_count,
        avg(ds.close) OVER w20 ma20, max(ds.close) OVER w20 hi20, min(ds.close) OVER w20 lo20,
        stddev_samp(ds.daily_return_pct) OVER w20 vol20, s.sector
      FROM public.daily_snapshots ds
      JOIN public.stocks s ON s.symbol = ds.symbol
      WHERE ds.symbol IN (SELECT symbol FROM b)
      WINDOW w20 AS (PARTITION BY ds.symbol ORDER BY ds.day_index ROWS BETWEEN 19 PRECEDING AND CURRENT ROW)
    ),
    grp AS (
      SELECT *,
        sum(CASE WHEN ret > 0 THEN 0 ELSE 1 END) OVER (PARTITION BY symbol ORDER BY day_index) g_grp,
        sum(CASE WHEN ret < 0 THEN 0 ELSE 1 END) OVER (PARTITION BY symbol ORDER BY day_index) r_grp
      FROM roll
    ),
    st AS (
      SELECT *,
        CASE WHEN ret > 0 THEN count(*) OVER (PARTITION BY symbol, g_grp ORDER BY day_index) ELSE 0 END green_streak,
        CASE WHEN ret < 0 THEN count(*) OVER (PARTITION BY symbol, r_grp ORDER BY day_index) ELSE 0 END red_streak
      FROM grp
    ),
    scoped AS (SELECT * FROM st WHERE snapshot_date >= _scope)
    SELECT sc.snap_id, sc.symbol, sc.snapshot_date, sc.day_index, sc.sector, sc.close, sc.ret,
      sc.vr1, sc.vr2, sc.vr3, sc.vr5, sc.vr20, sc.ret_2d, sc.ret_3d, sc.ret_5d, sc.ret_10d, sc.ret_20d,
      sc.tv, sc.mcap, sc.kap_count, sc.ma20, sc.hi20, sc.lo20, sc.vol20, sc.green_streak, sc.red_streak,
      CASE WHEN sc.ma20 > 0 THEN (sc.close / sc.ma20 - 1) * 100 END,
      CASE WHEN sc.hi20 > 0 THEN (sc.close / sc.hi20 - 1) * 100 END,
      CASE WHEN sc.lo20 > 0 THEN (sc.close / sc.lo20 - 1) * 100 END,
      CASE WHEN sc.close > 0 THEN (sc.hi20 - sc.lo20) / sc.close * 100 END,
      NULL::numeric, NULL::numeric, kap.category
    FROM scoped sc
    LEFT JOIN LATERAL (
      SELECT category FROM public.kap_disclosures k
      WHERE k.symbol = sc.symbol AND k.disclosure_date = sc.snapshot_date
      GROUP BY category ORDER BY count(*) DESC LIMIT 1
    ) kap ON true;

    UPDATE public.ai_symbol_queue SET feat_done=true WHERE symbol IN (SELECT symbol FROM b);
  END IF;

  SELECT count(*) FILTER (WHERE feat_done), count(*) FILTER (WHERE NOT feat_done)
    INTO _done, _left FROM public.ai_symbol_queue;

  IF _left = 0 THEN
    UPDATE public.ai_progress SET stage='secstats', phase='Computing sector statistics',
      rows_done=_done, pct=26, stage_started_at=now(), updated_at=now() WHERE id=1;
  ELSE
    UPDATE public.ai_progress SET rows_done=_done,
      pct=round(2 + 24.0*_done/NULLIF(rows_total,0),2), updated_at=now() WHERE id=1;
  END IF;
END$$;

-- ========================= STAGE: sector stats =========================
CREATE OR REPLACE FUNCTION public.ai_stage_secstats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
BEGIN
  WITH ss AS (
    SELECT snapshot_date, sector,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY ret_20d) med,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ret_20d) p75
    FROM public.discovery_features WHERE sector IS NOT NULL GROUP BY snapshot_date, sector
  )
  UPDATE public.discovery_features f
    SET sec_med_ret20 = ss.med, sec_p75_ret20 = ss.p75
  FROM ss WHERE ss.snapshot_date = f.snapshot_date AND ss.sector = f.sector;

  UPDATE public.ai_progress SET stage='matrix', phase='Computing forward-return targets',
    rows_total=(SELECT count(*) FROM public.ai_symbol_queue), rows_done=0,
    pct=28, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: matrix (per-symbol batch) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_matrix(_batch int DEFAULT 30)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _left int; _done int;
BEGIN
  CREATE TEMP TABLE b ON COMMIT DROP AS
    SELECT symbol FROM public.ai_symbol_queue WHERE NOT matrix_done ORDER BY symbol LIMIT _batch;

  IF EXISTS (SELECT 1 FROM b) THEN
    INSERT INTO public.discovery_matrix(
      row_id, snap_id, symbol, snapshot_date, sector, market_value,
      tgt_lu, lu_days, lu_fwd, eval_lu, tgt_g10, g10_days, g10_fwd, eval_g10,
      tgt_g15, g15_days, g15_fwd, eval_g15, tgt_g20, g20_days, g20_fwd, eval_g20)
    SELECT f.row_id, f.snap_id, f.symbol, f.snapshot_date, f.sector, f.mcap,
      coalesce(w.lu_hit, false), w.d_lu, w.m5, coalesce(w.has5, false),
      coalesce(w.m5 >= 10, false), w.d_g10, w.m5, coalesce(w.has5, false),
      coalesce(w.m10 >= 15, false), w.d_g15, w.m10, coalesce(w.has10, false),
      coalesce(w.m20 >= 20, false), w.d_g20, w.m20, coalesce(w.has20, false)
    FROM public.discovery_features f
    CROSS JOIN LATERAL (
      SELECT
        (max(n.close) FILTER (WHERE rn <= 5)  / NULLIF(f.close,0) - 1) * 100 m5,
        (max(n.close) FILTER (WHERE rn <= 10) / NULLIF(f.close,0) - 1) * 100 m10,
        (max(n.close) FILTER (WHERE rn <= 20) / NULLIF(f.close,0) - 1) * 100 m20,
        min(rn) FILTER (WHERE n.close >= f.close * 1.10 AND rn <= 5)  d_g10,
        min(rn) FILTER (WHERE n.close >= f.close * 1.15 AND rn <= 10) d_g15,
        min(rn) FILTER (WHERE n.close >= f.close * 1.20 AND rn <= 20) d_g20,
        min(rn) FILTER (WHERE n.ret  >= 9.5 AND rn <= 5) d_lu,
        bool_or(n.ret >= 9.5 AND rn <= 5) lu_hit,
        bool_or(rn >= 5) has5, bool_or(rn >= 10) has10, bool_or(rn >= 20) has20
      FROM (
        SELECT d.close, d.daily_return_pct ret, d.day_index - f.day_index rn
        FROM public.daily_snapshots d
        WHERE d.symbol = f.symbol AND d.day_index > f.day_index AND d.day_index <= f.day_index + 20
      ) n
    ) w
    WHERE f.symbol IN (SELECT symbol FROM b);

    UPDATE public.ai_symbol_queue SET matrix_done=true WHERE symbol IN (SELECT symbol FROM b);
  END IF;

  SELECT count(*) FILTER (WHERE matrix_done), count(*) FILTER (WHERE NOT matrix_done)
    INTO _done, _left FROM public.ai_symbol_queue;

  IF _left = 0 THEN
    UPDATE public.ai_progress SET stage='params', phase='Computing thresholds',
      rows_done=_done, pct=46, stage_started_at=now(), updated_at=now() WHERE id=1;
  ELSE
    UPDATE public.ai_progress SET rows_done=_done,
      pct=round(28 + 18.0*_done/NULLIF(rows_total,0),2), updated_at=now() WHERE id=1;
  END IF;
END$$;

-- ========================= STAGE: params + tstat =========================
CREATE OR REPLACE FUNCTION public.ai_stage_params()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _max bigint;
BEGIN
  UPDATE public.ai_params SET
    tv80 = (SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY tv) FROM public.discovery_features WHERE tv IS NOT NULL),
    tv90 = (SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY tv) FROM public.discovery_features WHERE tv IS NOT NULL),
    mcap_med = (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mcap) FROM public.discovery_features WHERE mcap IS NOT NULL),
    mcap_p20 = (SELECT percentile_cont(0.2) WITHIN GROUP (ORDER BY mcap) FROM public.discovery_features WHERE mcap IS NOT NULL),
    vol75 = (SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY vol20) FROM public.discovery_features WHERE vol20 IS NOT NULL),
    vol25 = (SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY vol20) FROM public.discovery_features WHERE vol20 IS NOT NULL)
  WHERE id=1;

  TRUNCATE public.ai_tstat;
  INSERT INTO public.ai_tstat(tk,tot,pos)
  SELECT 'lu', count(*) FILTER (WHERE eval_lu), count(*) FILTER (WHERE eval_lu AND tgt_lu) FROM public.discovery_matrix
  UNION ALL SELECT 'g10', count(*) FILTER (WHERE eval_g10), count(*) FILTER (WHERE eval_g10 AND tgt_g10) FROM public.discovery_matrix
  UNION ALL SELECT 'g15', count(*) FILTER (WHERE eval_g15), count(*) FILTER (WHERE eval_g15 AND tgt_g15) FROM public.discovery_matrix
  UNION ALL SELECT 'g20', count(*) FILTER (WHERE eval_g20), count(*) FILTER (WHERE eval_g20 AND tgt_g20) FROM public.discovery_matrix;

  SELECT coalesce(max(row_id),0) INTO _max FROM public.discovery_features;
  UPDATE public.ai_progress SET stage='flags', phase='Generating binary signal flags',
    rows_total=_max, rows_done=0, cursor_pos=0, pct=48, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: flags (row batch) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_flags(_step bigint DEFAULT 20000)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _lo bigint; _hi bigint; _max bigint; _p public.ai_params;
BEGIN
  SELECT * INTO _p FROM public.ai_params WHERE id=1;
  SELECT cursor_pos, rows_total INTO _lo, _max FROM public.ai_progress WHERE id=1;
  _hi := _lo + _step;

  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT f.row_id, p.pred_key
  FROM public.discovery_features f
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
  WHERE f.row_id > _lo AND f.row_id <= _hi AND p.present;

  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT row_id, 'sector:' || sector FROM public.discovery_features
  WHERE row_id > _lo AND row_id <= _hi AND sector IS NOT NULL;
  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT row_id, 'kapcat:' || kap_category FROM public.discovery_features
  WHERE row_id > _lo AND row_id <= _hi AND kap_category IS NOT NULL;

  IF _hi >= _max THEN
    UPDATE public.ai_progress SET stage='predcatalog', phase='Building predicate catalog',
      cursor_pos=_max, rows_done=_max, pct=62, stage_started_at=now(), updated_at=now() WHERE id=1;
  ELSE
    UPDATE public.ai_progress SET cursor_pos=_hi, rows_done=_hi,
      pct=round(48 + 14.0*_hi/NULLIF(_max,0),2), updated_at=now() WHERE id=1;
  END IF;
END$$;

-- ========================= STAGE: predicate catalog =========================
CREATE OR REPLACE FUNCTION public.ai_stage_predcatalog()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
BEGIN
  TRUNCATE public.pred_catalog;
  INSERT INTO public.pred_catalog(pred_key, label, feature_group) VALUES
    ('vr1_ge1_5','1d volume ≥ 1.5× prev','volume'),('vr1_ge2','1d volume ≥ 2× prev','volume'),
    ('vr2_ge1_5','2d volume ≥ 1.5× avg','volume'),('vr2_ge2','2d volume ≥ 2× avg','volume'),
    ('vr3_ge1_5','3d volume ≥ 1.5× avg','volume'),('vr3_ge2','3d volume ≥ 2× avg','volume'),
    ('vr5_ge1_5','5d volume ≥ 1.5× avg','volume'),('vr5_ge2','5d volume ≥ 2× avg','volume'),
    ('vr20_ge2','Volume ≥ 2× 20d avg','volume'),('vr20_ge3','Volume ≥ 3× 20d avg','volume'),
    ('vr20_ge5','Volume ≥ 5× 20d avg','volume'),('vol_accel','Volume accelerating (1d ≥ 1.5× 5d)','volume'),
    ('tv_top20','Traded value top 20%','liquidity'),('tv_top10','Traded value top 10%','liquidity'),
    ('mcap_small','Market cap below median','marketcap'),('mcap_micro','Market cap bottom 20%','marketcap'),
    ('vol_high','High volatility (top 25%)','volatility'),('vol_low','Low volatility (bottom 25%)','volatility'),
    ('above_ma20','Above 20d average','trend'),('far_above_ma20','≥ 10% above 20d average','trend'),
    ('near_ma20','Within 3% of 20d average','trend'),('below_ma20','Below 20d average','trend'),
    ('near_high20','Within 3% of 20d high','trend'),('new_high20','At new 20d high','trend'),
    ('off_low20','≥ 20% above 20d low','trend'),('near_low20','Within 5% of 20d low','trend'),
    ('ret2_ge2','2d return ≥ +2%','momentum'),('ret3_ge3','3d return ≥ +3%','momentum'),
    ('ret5_ge5','5d return ≥ +5%','momentum'),('ret5_pos','5d return positive','momentum'),
    ('ret5_neg','5d return negative (pullback)','momentum'),('ret10_ge10','10d return ≥ +10%','momentum'),
    ('ret10_pos','10d return positive','momentum'),('green_ge2','≥ 2 consecutive green days','streak'),
    ('green_ge3','≥ 3 consecutive green days','streak'),('red_ge2','≥ 2 consecutive red days','streak'),
    ('red_ge3','≥ 3 consecutive red days','streak'),('consolidating','Price consolidating (20d range ≤ 10%)','structure'),
    ('rs_pos','Outperforming sector (20d)','relative_strength'),('rs_strong','Top-quartile in sector (20d)','relative_strength'),
    ('kap_present','KAP disclosure present','kap'),('kap_2plus','≥ 2 KAP disclosures','kap')
  ON CONFLICT (pred_key) DO UPDATE SET label=EXCLUDED.label, feature_group=EXCLUDED.feature_group;

  INSERT INTO public.pred_catalog(pred_key, label, feature_group)
  SELECT DISTINCT 'sector:' || sector, 'Sector: ' || sector, 'sector'
  FROM public.discovery_features WHERE sector IS NOT NULL ON CONFLICT (pred_key) DO NOTHING;
  INSERT INTO public.pred_catalog(pred_key, label, feature_group)
  SELECT DISTINCT 'kapcat:' || kap_category, 'KAP: ' || kap_category, 'kap'
  FROM public.discovery_features WHERE kap_category IS NOT NULL ON CONFLICT (pred_key) DO NOTHING;

  -- Build supported-flag index and predicate list
  TRUNCATE public.ai_mf;
  INSERT INTO public.ai_mf(row_id, pred_key)
  SELECT m.row_id, m.pred_key FROM public.matrix_flags m
  JOIN (SELECT pred_key FROM public.matrix_flags GROUP BY pred_key
        HAVING count(*) >= (SELECT min_support FROM public.ai_progress WHERE id=1)) sup
    USING (pred_key);

  TRUNCATE public.ai_pred_list;
  INSERT INTO public.ai_pred_list(pred_key, ord)
  SELECT pred_key, row_number() OVER (ORDER BY pred_key)
  FROM (SELECT DISTINCT pred_key FROM public.ai_mf) t;

  UPDATE public.ai_progress SET stage='single', phase='Scoring single-feature signals',
    combos_total=(SELECT count(*) FROM public.ai_pred_list), combos_done=0,
    pct=64, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: single combos =========================
CREATE OR REPLACE FUNCTION public.ai_stage_single()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _msup int;
BEGIN
  SELECT min_support INTO _msup FROM public.ai_progress WHERE id=1;

  INSERT INTO public.ai_combos(n_preds, keys,
    occ_lu,s_lu,af_lu,mf_lu,ad_lu, occ_g10,s_g10,af_g10,mf_g10,ad_g10,
    occ_g15,s_g15,af_g15,mf_g15,ad_g15, occ_g20,s_g20,af_g20,mf_g20,ad_g20)
  SELECT 1, ARRAY[f.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu), avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10), avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15), avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20), avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM public.ai_mf f JOIN public.discovery_matrix m ON m.row_id = f.row_id
  GROUP BY f.pred_key;

  -- mark top-28 single preds for triple expansion
  WITH ranked AS (
    SELECT keys[1] pk, GREATEST(
      coalesce(s_lu::numeric/NULLIF(occ_lu,0),0), coalesce(s_g10::numeric/NULLIF(occ_g10,0),0),
      coalesce(s_g15::numeric/NULLIF(occ_g15,0),0), coalesce(s_g20::numeric/NULLIF(occ_g20,0),0)) sc
    FROM public.ai_combos WHERE n_preds=1
  ), r AS (SELECT pk, row_number() OVER (ORDER BY sc DESC NULLS LAST) rnk FROM ranked)
  UPDATE public.ai_pred_list pl SET is_top = (r.rnk <= 28) FROM r WHERE r.pk = pl.pred_key;

  UPDATE public.ai_pred_list pl SET ord_top = x.r
  FROM (SELECT pred_key, row_number() OVER (ORDER BY ord) r FROM public.ai_pred_list WHERE is_top) x
  WHERE x.pred_key = pl.pred_key;

  UPDATE public.ai_progress SET stage='pair', phase='Scoring two-feature combinations',
    combos_total=(SELECT count(*) FROM public.ai_pred_list), combos_done=0, cursor_pos=0,
    pct=68, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: pair combos (pred batch) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_pair(_pb int DEFAULT 6)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _lo bigint; _hi bigint; _tot bigint; _msup int;
BEGIN
  SELECT cursor_pos, combos_total, min_support INTO _lo, _tot, _msup FROM public.ai_progress WHERE id=1;
  _hi := _lo + _pb;

  INSERT INTO public.ai_combos(n_preds, keys,
    occ_lu,s_lu,af_lu,mf_lu,ad_lu, occ_g10,s_g10,af_g10,mf_g10,ad_g10,
    occ_g15,s_g15,af_g15,mf_g15,ad_g15, occ_g20,s_g20,af_g20,mf_g20,ad_g20)
  SELECT 2, ARRAY[a.pred_key, b.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu), avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10), avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15), avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20), avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM public.ai_mf a
  JOIN public.ai_pred_list pa ON pa.pred_key = a.pred_key AND pa.ord > _lo AND pa.ord <= _hi
  JOIN public.ai_mf b ON b.row_id = a.row_id AND b.pred_key > a.pred_key
  JOIN public.discovery_matrix m ON m.row_id = a.row_id
  GROUP BY a.pred_key, b.pred_key
  HAVING count(*) >= _msup;

  IF _hi >= _tot THEN
    UPDATE public.ai_progress SET stage='triple', phase='Scoring three-feature combinations',
      cursor_pos=0, combos_done=_tot,
      combos_total=(SELECT count(*) FROM public.ai_pred_list WHERE is_top),
      pct=82, stage_started_at=now(), updated_at=now() WHERE id=1;
  ELSE
    UPDATE public.ai_progress SET cursor_pos=_hi, combos_done=_hi,
      pct=round(68 + 14.0*_hi/NULLIF(_tot,0),2), updated_at=now() WHERE id=1;
  END IF;
END$$;

-- ========================= STAGE: triple combos (top-pred batch) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_triple(_pb int DEFAULT 6)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _lo bigint; _hi bigint; _tot bigint; _msup int;
BEGIN
  SELECT cursor_pos, combos_total, min_support INTO _lo, _tot, _msup FROM public.ai_progress WHERE id=1;
  _hi := _lo + _pb;

  INSERT INTO public.ai_combos(n_preds, keys,
    occ_lu,s_lu,af_lu,mf_lu,ad_lu, occ_g10,s_g10,af_g10,mf_g10,ad_g10,
    occ_g15,s_g15,af_g15,mf_g15,ad_g15, occ_g20,s_g20,af_g20,mf_g20,ad_g20)
  SELECT 3, ARRAY[a.pred_key, b.pred_key, c.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu), avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10), avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15), avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20), avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM public.ai_mf a
  JOIN public.ai_pred_list pa ON pa.pred_key = a.pred_key AND pa.is_top AND pa.ord_top > _lo AND pa.ord_top <= _hi
  JOIN public.ai_mf b ON b.row_id = a.row_id AND b.pred_key > a.pred_key
  JOIN public.ai_pred_list pb ON pb.pred_key = b.pred_key AND pb.is_top
  JOIN public.ai_mf c ON c.row_id = a.row_id AND c.pred_key > b.pred_key
  JOIN public.ai_pred_list pc ON pc.pred_key = c.pred_key AND pc.is_top
  JOIN public.discovery_matrix m ON m.row_id = a.row_id
  GROUP BY a.pred_key, b.pred_key, c.pred_key
  HAVING count(*) >= _msup;

  IF _hi >= _tot THEN
    UPDATE public.ai_progress SET stage='validate', phase='Statistical validation',
      cursor_pos=0, combos_done=_tot, pct=92, stage_started_at=now(), updated_at=now() WHERE id=1;
  ELSE
    UPDATE public.ai_progress SET cursor_pos=_hi, combos_done=_hi,
      pct=round(82 + 10.0*_hi/NULLIF(_tot,0),2), updated_at=now() WHERE id=1;
  END IF;
END$$;

-- ========================= STAGE: validate =========================
CREATE OR REPLACE FUNCTION public.ai_stage_validate()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _run bigint; _msample int;
BEGIN
  SELECT run_id, min_sample INTO _run, _msample FROM public.ai_progress WHERE id=1;
  TRUNCATE public.ai_patterns;

  WITH clong AS (
    SELECT n_preds, keys, 'lu' tk, 5 hz, occ_lu occ, s_lu s, af_lu af, mf_lu mfwd, ad_lu ad FROM public.ai_combos
    UNION ALL SELECT n_preds, keys, 'g10', 5,  occ_g10, s_g10, af_g10, mf_g10, ad_g10 FROM public.ai_combos
    UNION ALL SELECT n_preds, keys, 'g15', 10, occ_g15, s_g15, af_g15, mf_g15, ad_g15 FROM public.ai_combos
    UNION ALL SELECT n_preds, keys, 'g20', 20, occ_g20, s_g20, af_g20, mf_g20, ad_g20 FROM public.ai_combos
  )
  INSERT INTO public.ai_patterns(
    run_id, target_key, horizon, n_preds, pred_keys, label,
    occurrences, successes, failures, precision_pct, recall_pct, fpr_pct, base_rate_pct, lift,
    avg_fwd, median_fwd, avg_days_to_target, z_score, p_value, ci_low, ci_high, significant)
  SELECT _run, c.tk, c.hz, c.n_preds, c.keys, array_to_string(c.keys, ' + '),
    c.occ, c.s, c.occ - c.s,
    round(100.0 * c.s / NULLIF(c.occ,0), 2),
    round(100.0 * c.s / NULLIF(ts.pos,0), 2),
    round(100.0 * (c.occ - c.s) / NULLIF(ts.tot - ts.pos,0), 2),
    round(100.0 * ts.pos / NULLIF(ts.tot,0), 2),
    round((v.phat / NULLIF(v.base,0))::numeric, 3),
    round(c.af, 2), round(c.mfwd, 2), round(c.ad, 2),
    round(z.zv::numeric, 3),
    round((2.0 * (1.0 - public.normal_cdf(abs(z.zv))))::numeric, 4),
    round((100.0 * (v.phat + 1.9208/v.n - 1.96 * sqrt(v.phat*(1-v.phat)/v.n + 0.9604/(v.n*v.n))) / (1 + 3.8416/v.n))::numeric, 2),
    round((100.0 * (v.phat + 1.9208/v.n + 1.96 * sqrt(v.phat*(1-v.phat)/v.n + 0.9604/(v.n*v.n))) / (1 + 3.8416/v.n))::numeric, 2),
    (c.occ >= _msample AND z.zv >= 1.96 AND v.base > 0 AND v.phat / NULLIF(v.base,0) >= 1.2)
  FROM clong c
  JOIN public.ai_tstat ts ON ts.tk = c.tk
  CROSS JOIN LATERAL (SELECT c.s::double precision / NULLIF(c.occ,0) phat,
                             ts.pos::double precision / NULLIF(ts.tot,0) base,
                             c.occ::double precision n) v
  CROSS JOIN LATERAL (SELECT CASE WHEN v.base > 0 AND v.base < 1 AND v.n > 0
                             THEN (v.phat - v.base) / sqrt(v.base * (1 - v.base) / v.n) END zv) z
  WHERE c.occ >= _msample;

  UPDATE public.ai_patterns p SET label = sub.lbl FROM (
    SELECT ap.id, string_agg(coalesce(pc.label, u.k), ' + ' ORDER BY u.ord) lbl
    FROM public.ai_patterns ap
    CROSS JOIN LATERAL unnest(ap.pred_keys) WITH ORDINALITY u(k, ord)
    LEFT JOIN public.pred_catalog pc ON pc.pred_key = u.k
    GROUP BY ap.id
  ) sub WHERE sub.id = p.id;

  UPDATE public.ai_patterns p SET parent_precision = sub.pp, precision_gain = round(p.precision_pct - sub.pp, 2)
  FROM (
    SELECT p1.id, max(p2.precision_pct) pp
    FROM public.ai_patterns p1
    JOIN public.ai_patterns p2 ON p2.target_key = p1.target_key
       AND p2.n_preds = p1.n_preds - 1 AND p2.pred_keys <@ p1.pred_keys
    WHERE p1.n_preds > 1 GROUP BY p1.id
  ) sub WHERE sub.id = p.id;

  UPDATE public.ai_patterns SET
    overfit = (occurrences < GREATEST(_msample, 30)
               OR ci_low <= base_rate_pct
               OR p_value IS NULL OR p_value > 0.05
               OR (n_preds > 1 AND coalesce(precision_gain, 0) < 0)),
    robust = (coalesce(significant,false) AND occurrences >= _msample
              AND ci_low > base_rate_pct AND p_value <= 0.05);

  UPDATE public.ai_patterns SET robust = (robust AND NOT coalesce(overfit, false));

  UPDATE public.ai_patterns SET rank = x.r FROM (
    SELECT id, row_number() OVER (PARTITION BY target_key
      ORDER BY significant DESC, lift DESC NULLS LAST, precision_pct DESC NULLS LAST, occurrences DESC) r
    FROM public.ai_patterns
  ) x WHERE public.ai_patterns.id = x.id;

  DELETE FROM public.ai_patterns WHERE rank > 300;

  UPDATE public.ai_progress SET stage='quality', phase='Building Top-100 / Top-20 / importance',
    pct=94, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: quality (top100/top20/importance) =========================
CREATE OR REPLACE FUNCTION public.ai_stage_quality()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _run bigint;
BEGIN
  SELECT run_id INTO _run FROM public.ai_progress WHERE id=1;

  TRUNCATE public.ai_top_patterns;
  INSERT INTO public.ai_top_patterns(rank,target_key,horizon,label,pred_keys,n_preds,
    occurrences,successes,failures,precision_pct,recall_pct,fpr_pct,base_rate_pct,lift,
    z_score,p_value,ci_low,ci_high,avg_fwd,median_fwd,avg_days_to_target,overfit,robust)
  SELECT row_number() OVER (ORDER BY (NOT coalesce(overfit,true)) DESC, z_score DESC NULLS LAST, lift DESC NULLS LAST, precision_pct DESC NULLS LAST),
    target_key,horizon,label,pred_keys,n_preds,occurrences,successes,failures,precision_pct,recall_pct,fpr_pct,base_rate_pct,lift,
    z_score,p_value,ci_low,ci_high,avg_fwd,median_fwd,avg_days_to_target,overfit,robust
  FROM public.ai_patterns
  WHERE coalesce(significant,false)
  ORDER BY (NOT coalesce(overfit,true)) DESC, z_score DESC NULLS LAST, lift DESC NULLS LAST, precision_pct DESC NULLS LAST
  LIMIT 100;

  TRUNCATE public.ai_top_signals;
  INSERT INTO public.ai_top_signals(rank,target_key,horizon,label,pred_keys,occurrences,precision_pct,lift,ci_low,z_score,confidence)
  SELECT row_number() OVER (ORDER BY ci_low DESC NULLS LAST, z_score DESC NULLS LAST, precision_pct DESC NULLS LAST),
    target_key,horizon,label,pred_keys,occurrences,precision_pct,lift,ci_low,z_score, round(ci_low,2)
  FROM public.ai_patterns
  WHERE coalesce(robust,false)
  ORDER BY ci_low DESC NULLS LAST, z_score DESC NULLS LAST, precision_pct DESC NULLS LAST
  LIMIT 20;

  -- feature importance from robust (fallback significant) patterns
  TRUNCATE public.ai_feature_importance;
  INSERT INTO public.ai_feature_importance(target_key,pred_key,label,feature_group,appearances,avg_precision,avg_lift,best_precision,importance)
  SELECT p.target_key, u.k, coalesce(pc.label,u.k), coalesce(pc.feature_group,'other'),
    count(*), round(avg(p.precision_pct),2), round(avg(p.lift),3), round(max(p.precision_pct),2),
    round(sum(p.lift * ln(p.occurrences + 1)),3)
  FROM public.ai_patterns p
  CROSS JOIN LATERAL unnest(p.pred_keys) u(k)
  LEFT JOIN public.pred_catalog pc ON pc.pred_key = u.k
  WHERE coalesce(p.robust,false) OR coalesce(p.significant,false)
  GROUP BY p.target_key, u.k, pc.label, pc.feature_group;
  UPDATE public.ai_feature_importance fi SET rank = x.r
  FROM (SELECT id, row_number() OVER (PARTITION BY target_key ORDER BY importance DESC) r FROM public.ai_feature_importance) x
  WHERE fi.id = x.id;

  -- materialise pattern -> rows for top patterns
  TRUNCATE public.ai_pattern_rows;
  INSERT INTO public.ai_pattern_rows(pattern_id, row_id)
  SELECT tp.id, mf.row_id
  FROM public.ai_top_patterns tp
  JOIN public.ai_mf mf ON mf.pred_key = ANY(tp.pred_keys)
  WHERE mf.pred_key IN (SELECT DISTINCT unnest(pred_keys) FROM public.ai_top_patterns)
  GROUP BY tp.id, mf.row_id, tp.n_preds
  HAVING count(*) = tp.n_preds;

  INSERT INTO public.ai_signal_quality(run_id, run_date, target_key, n_patterns, n_significant, top_precision, top_lift, best_label)
  SELECT _run, current_date, target_key, count(*), count(*) FILTER (WHERE significant),
         max(precision_pct), max(lift), (array_agg(label ORDER BY rank))[1]
  FROM public.ai_patterns GROUP BY target_key;

  UPDATE public.ai_progress SET stage='oos', phase='Out-of-sample validation',
    pct=96, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: out-of-sample =========================
CREATE OR REPLACE FUNCTION public.ai_stage_oos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
BEGIN
  TRUNCATE public.ai_oos_validation;
  INSERT INTO public.ai_oos_validation(target_key,in_sample_precision,oos_precision,in_sample_n,oos_n,train_period,test_period,note)
  SELECT tk,
    round(100.0*sum(CASE WHEN d < DATE '2026-01-01' AND tg THEN 1 ELSE 0 END)::numeric/NULLIF(sum(CASE WHEN d < DATE '2026-01-01' THEN 1 ELSE 0 END),0),2),
    round(100.0*sum(CASE WHEN d >= DATE '2026-01-01' AND tg THEN 1 ELSE 0 END)::numeric/NULLIF(sum(CASE WHEN d >= DATE '2026-01-01' THEN 1 ELSE 0 END),0),2),
    sum(CASE WHEN d < DATE '2026-01-01' THEN 1 ELSE 0 END),
    sum(CASE WHEN d >= DATE '2026-01-01' THEN 1 ELSE 0 END),
    'Train: 2025', 'Test: 2026+', 'Pooled precision across Top-100 patterns, chronological split'
  FROM (
    SELECT tp.target_key tk, m.snapshot_date d,
      (CASE tp.target_key WHEN 'lu' THEN m.eval_lu WHEN 'g10' THEN m.eval_g10 WHEN 'g15' THEN m.eval_g15 ELSE m.eval_g20 END) ev,
      (CASE tp.target_key WHEN 'lu' THEN m.tgt_lu  WHEN 'g10' THEN m.tgt_g10  WHEN 'g15' THEN m.tgt_g15  ELSE m.tgt_g20  END) tg
    FROM public.ai_pattern_rows pr
    JOIN public.ai_top_patterns tp ON tp.id = pr.pattern_id
    JOIN public.discovery_matrix m ON m.row_id = pr.row_id
  ) q
  WHERE ev
  GROUP BY tk;

  UPDATE public.ai_progress SET stage='backtest', phase='Monthly backtest',
    pct=98, stage_started_at=now(), updated_at=now() WHERE id=1;
END$$;

-- ========================= STAGE: backtest + finalize =========================
CREATE OR REPLACE FUNCTION public.ai_stage_backtest()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _run bigint;
BEGIN
  SELECT run_id INTO _run FROM public.ai_progress WHERE id=1;

  TRUNCATE public.ai_backtest_monthly;
  INSERT INTO public.ai_backtest_monthly(month, target_key, occurrences, successes, precision_pct)
  SELECT date_trunc('month', d)::date, tk,
    count(*) FILTER (WHERE ev),
    count(*) FILTER (WHERE ev AND tg),
    round(100.0*count(*) FILTER (WHERE ev AND tg)/NULLIF(count(*) FILTER (WHERE ev),0),2)
  FROM (
    SELECT tp.target_key tk, m.snapshot_date d,
      (CASE tp.target_key WHEN 'lu' THEN m.eval_lu WHEN 'g10' THEN m.eval_g10 WHEN 'g15' THEN m.eval_g15 ELSE m.eval_g20 END) ev,
      (CASE tp.target_key WHEN 'lu' THEN m.tgt_lu  WHEN 'g10' THEN m.tgt_g10  WHEN 'g15' THEN m.tgt_g15  ELSE m.tgt_g20  END) tg
    FROM public.ai_pattern_rows pr
    JOIN public.ai_top_patterns tp ON tp.id = pr.pattern_id
    JOIN public.discovery_matrix m ON m.row_id = pr.row_id
  ) q
  GROUP BY 1,2 ORDER BY 1,2;

  PERFORM public.build_coverage_report();

  UPDATE public.ai_runs SET finished_at=now(), status='done',
    n_patterns=(SELECT count(*) FROM public.ai_patterns),
    n_significant=(SELECT count(*) FROM public.ai_patterns WHERE significant)
  WHERE id=_run;

  UPDATE public.ai_meta SET status='done', phase='Complete', last_run_at=now(), updated_at=now(),
    matrix_rows=(SELECT count(*) FROM public.discovery_matrix),
    n_patterns=(SELECT count(*) FROM public.ai_patterns),
    n_significant=(SELECT count(*) FROM public.ai_patterns WHERE significant)
  WHERE id=1;

  PERFORM public.ai_score_daily();

  UPDATE public.ai_progress SET stage='done', status='done', phase='Complete',
    pct=100, eta_seconds=0, updated_at=now() WHERE id=1;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='ai_discovery_drive') THEN
    PERFORM cron.unschedule('ai_discovery_drive');
  END IF;
END$$;

-- ========================= DRIVER =========================
CREATE OR REPLACE FUNCTION public.ai_drive()
RETURNS public.ai_progress LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE p public.ai_progress; _elapsed numeric;
BEGIN
  IF NOT pg_try_advisory_xact_lock(991122) THEN
    SELECT * INTO p FROM public.ai_progress WHERE id=1; RETURN p;
  END IF;

  SELECT * INTO p FROM public.ai_progress WHERE id=1;
  IF p.status <> 'running' THEN RETURN p; END IF;

  BEGIN
    CASE p.stage
      WHEN 'reset'       THEN PERFORM public.ai_stage_reset();
      WHEN 'features'    THEN PERFORM public.ai_stage_features(30);
      WHEN 'secstats'    THEN PERFORM public.ai_stage_secstats();
      WHEN 'matrix'      THEN PERFORM public.ai_stage_matrix(30);
      WHEN 'params'      THEN PERFORM public.ai_stage_params();
      WHEN 'flags'       THEN PERFORM public.ai_stage_flags(20000);
      WHEN 'predcatalog' THEN PERFORM public.ai_stage_predcatalog();
      WHEN 'single'      THEN PERFORM public.ai_stage_single();
      WHEN 'pair'        THEN PERFORM public.ai_stage_pair(6);
      WHEN 'triple'      THEN PERFORM public.ai_stage_triple(6);
      WHEN 'validate'    THEN PERFORM public.ai_stage_validate();
      WHEN 'quality'     THEN PERFORM public.ai_stage_quality();
      WHEN 'oos'         THEN PERFORM public.ai_stage_oos();
      WHEN 'backtest'    THEN PERFORM public.ai_stage_backtest();
      ELSE NULL;
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.ai_progress SET error = SQLERRM, updated_at=now() WHERE id=1;
    SELECT * INTO p FROM public.ai_progress WHERE id=1;
    RETURN p;
  END;

  SELECT * INTO p FROM public.ai_progress WHERE id=1;
  IF p.started_at IS NOT NULL AND p.pct > 0 AND p.pct < 100 THEN
    _elapsed := extract(epoch FROM (now() - p.started_at));
    UPDATE public.ai_progress SET eta_seconds = round(_elapsed * (100 - p.pct) / NULLIF(p.pct,0))
      WHERE id=1;
    SELECT * INTO p FROM public.ai_progress WHERE id=1;
  END IF;

  RETURN p;
END$$;

-- ========================= STARTER =========================
CREATE OR REPLACE FUNCTION public.ai_discovery_start(_scope date DEFAULT DATE '2025-01-01', _min_sample int DEFAULT 40, _min_support int DEFAULT 25)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.ai_progress SET
    scope_start=_scope, min_sample=_min_sample, min_support=_min_support,
    stage='reset', status='running', phase='Queued', rows_total=0, rows_done=0,
    combos_total=0, combos_done=0, cursor_pos=0, pct=0, eta_seconds=NULL, error=NULL,
    started_at=now(), stage_started_at=now(), updated_at=now()
  WHERE id=1;
END$$;

-- ========================= DAILY SCORING =========================
CREATE OR REPLACE FUNCTION public.ai_score_daily()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE _d date; _p public.ai_params;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_top_patterns LIMIT 1) THEN RETURN; END IF;
  SELECT * INTO _p FROM public.ai_params WHERE id=1;
  SELECT max(snapshot_date) INTO _d FROM public.daily_snapshots;
  IF _d IS NULL THEN RETURN; END IF;

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

  UPDATE public.ai_watchlist w SET rank = x.r
  FROM (SELECT id, row_number() OVER (ORDER BY probability DESC NULLS LAST, confidence DESC NULLS LAST, matched_patterns DESC) r
        FROM public.ai_watchlist WHERE score_date=_d) x
  WHERE w.id = x.id;
END$$;
