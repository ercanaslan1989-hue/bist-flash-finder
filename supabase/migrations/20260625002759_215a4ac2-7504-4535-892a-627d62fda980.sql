
-- =========================================================================
-- 1. KAP DISCLOSURES (ready-to-fill) + auto classifier
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.kap_disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  company_name text,
  disclosure_date date NOT NULL,
  disclosure_time time,
  disclosure_type text,
  title text,
  summary text,
  category text,
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kap_disclosures_dedupe
  ON public.kap_disclosures (symbol, disclosure_date, coalesce(source_id, title));
CREATE INDEX IF NOT EXISTS kap_disclosures_symbol_date ON public.kap_disclosures (symbol, disclosure_date);
CREATE INDEX IF NOT EXISTS kap_disclosures_category ON public.kap_disclosures (category);

GRANT SELECT ON public.kap_disclosures TO anon, authenticated;
GRANT ALL ON public.kap_disclosures TO service_role;
ALTER TABLE public.kap_disclosures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kap public read" ON public.kap_disclosures FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.classify_kap(_title text, _type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN t ~ '(sermaye|bedelli|bedelsiz|payların? itibari)' THEN 'capital_increase'
    WHEN t ~ '(temett|kar pay|kâr pay|kar dağıt|kâr dağıt)' THEN 'dividend'
    WHEN t ~ '(finansal rapor|finansal tablo|bilanço|faaliyet raporu|finansal sonuç|bağımsız denetim)' THEN 'financials'
    WHEN t ~ '(birleşme|devral|satın al|pay devri|hisse devri|iştirak edin)' THEN 'merger_acquisition'
    WHEN t ~ '(yönetim kurulu|genel kurul|istifa|atama|görev|murahhas)' THEN 'management'
    WHEN t ~ '(yatırım|tesis|kapasite|fabrika|üretim hattı|teşvik)' THEN 'investment'
    WHEN t ~ '(sözleşme|ihale|sipariş|anlaşma|protokol|bayilik)' THEN 'contract'
    WHEN t ~ '(geri alım|pay geri|hisse geri)' THEN 'buyback'
    WHEN t ~ '(dava|icra|mahkeme|hukuk|ceza|tazminat)' THEN 'legal'
    ELSE 'other'
  END
  FROM (SELECT lower(coalesce(_title,'') || ' ' || coalesce(_type,'')) AS t) s;
$$;

CREATE OR REPLACE FUNCTION public.kap_autoclassify()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.category IS NULL THEN
    NEW.category := public.classify_kap(NEW.title, NEW.disclosure_type);
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_kap_autoclassify ON public.kap_disclosures;
CREATE TRIGGER trg_kap_autoclassify
  BEFORE INSERT OR UPDATE ON public.kap_disclosures
  FOR EACH ROW EXECUTE FUNCTION public.kap_autoclassify();

CREATE OR REPLACE FUNCTION public.refresh_kap_features()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '0' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.kap_disclosures LIMIT 1) THEN
    RETURN;
  END IF;
  UPDATE public.daily_snapshots ds SET
    kap_count = coalesce(k.c, 0),
    last_kap_date = k.last_date
  FROM (
    SELECT symbol, disclosure_date, count(*) c, max(disclosure_date) last_date
    FROM public.kap_disclosures GROUP BY symbol, disclosure_date
  ) k
  WHERE k.symbol = ds.symbol AND k.disclosure_date = ds.snapshot_date;
END$$;

-- =========================================================================
-- 2. BIST COVERAGE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.bist_active_universe (
  symbol text PRIMARY KEY,
  company_name text,
  is_active boolean NOT NULL DEFAULT true,
  ipo_date date,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bist_active_universe TO anon, authenticated;
GRANT ALL ON public.bist_active_universe TO service_role;
ALTER TABLE public.bist_active_universe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "universe public read" ON public.bist_active_universe FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.coverage_by_symbol (
  symbol text PRIMARY KEY,
  company_name text,
  in_universe boolean,
  has_data boolean,
  earliest_date date,
  latest_date date,
  n_days integer
);
GRANT SELECT ON public.coverage_by_symbol TO anon, authenticated;
GRANT ALL ON public.coverage_by_symbol TO service_role;
ALTER TABLE public.coverage_by_symbol ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coverage_by_symbol public read" ON public.coverage_by_symbol FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.coverage_report (
  id integer PRIMARY KEY DEFAULT 1,
  total_active integer,
  imported integer,
  missing integer,
  coverage_pct numeric,
  missing_symbols text[],
  universe_source text,
  generated_at timestamptz
);
GRANT SELECT ON public.coverage_report TO anon, authenticated;
GRANT ALL ON public.coverage_report TO service_role;
ALTER TABLE public.coverage_report ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coverage_report public read" ON public.coverage_report FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.build_coverage_report()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '0' AS $$
DECLARE _src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bist_active_universe LIMIT 1) THEN
    INSERT INTO public.bist_active_universe(symbol, company_name, source)
    SELECT symbol, company_name, 'derived_from_stocks' FROM public.stocks
    ON CONFLICT (symbol) DO NOTHING;
  END IF;
  SELECT coalesce(max(source), 'derived_from_stocks') INTO _src FROM public.bist_active_universe;

  TRUNCATE public.coverage_by_symbol;
  INSERT INTO public.coverage_by_symbol(symbol, company_name, in_universe, has_data, earliest_date, latest_date, n_days)
  SELECT u.symbol, u.company_name, true, (d.symbol IS NOT NULL), d.first_d, d.last_d, coalesce(d.n, 0)
  FROM public.bist_active_universe u
  LEFT JOIN (
    SELECT symbol, min(snapshot_date) first_d, max(snapshot_date) last_d, count(*) n
    FROM public.daily_snapshots GROUP BY symbol
  ) d ON d.symbol = u.symbol
  WHERE u.is_active
  ON CONFLICT (symbol) DO UPDATE SET
    company_name = EXCLUDED.company_name, in_universe = true, has_data = EXCLUDED.has_data,
    earliest_date = EXCLUDED.earliest_date, latest_date = EXCLUDED.latest_date, n_days = EXCLUDED.n_days;

  INSERT INTO public.coverage_by_symbol(symbol, company_name, in_universe, has_data, earliest_date, latest_date, n_days)
  SELECT d.symbol, s.company_name, false, true, d.first_d, d.last_d, d.n
  FROM (SELECT symbol, min(snapshot_date) first_d, max(snapshot_date) last_d, count(*) n
        FROM public.daily_snapshots GROUP BY symbol) d
  LEFT JOIN public.stocks s ON s.symbol = d.symbol
  WHERE NOT EXISTS (SELECT 1 FROM public.bist_active_universe u WHERE u.symbol = d.symbol AND u.is_active)
  ON CONFLICT (symbol) DO NOTHING;

  INSERT INTO public.coverage_report(id, total_active, imported, missing, coverage_pct, missing_symbols, universe_source, generated_at)
  SELECT 1,
    count(*) FILTER (WHERE in_universe),
    count(*) FILTER (WHERE in_universe AND has_data),
    count(*) FILTER (WHERE in_universe AND NOT has_data),
    round(100.0 * count(*) FILTER (WHERE in_universe AND has_data) / NULLIF(count(*) FILTER (WHERE in_universe), 0), 2),
    (SELECT array_agg(symbol ORDER BY symbol) FROM public.coverage_by_symbol WHERE in_universe AND NOT has_data),
    _src, now()
  FROM public.coverage_by_symbol
  ON CONFLICT (id) DO UPDATE SET
    total_active = EXCLUDED.total_active, imported = EXCLUDED.imported, missing = EXCLUDED.missing,
    coverage_pct = EXCLUDED.coverage_pct, missing_symbols = EXCLUDED.missing_symbols,
    universe_source = EXCLUDED.universe_source, generated_at = now();
END$$;

-- =========================================================================
-- 3. DISCOVERY MATRIX TABLES
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.discovery_features (
  row_id bigint PRIMARY KEY,
  snap_id uuid, symbol text, snapshot_date date, day_index integer, sector text,
  close numeric, ret numeric,
  vr1 numeric, vr2 numeric, vr3 numeric, vr5 numeric, vr20 numeric,
  ret_2d numeric, ret_3d numeric, ret_5d numeric, ret_10d numeric, ret_20d numeric,
  tv numeric, mcap numeric, kap_count integer,
  ma20 numeric, hi20 numeric, lo20 numeric, vol20 numeric,
  green_streak integer, red_streak integer,
  dist_ma20 numeric, dist_hi20 numeric, dist_lo20 numeric, range20 numeric,
  sec_med_ret20 numeric, sec_p75_ret20 numeric, kap_category text
);
GRANT SELECT ON public.discovery_features TO anon, authenticated;
GRANT ALL ON public.discovery_features TO service_role;
ALTER TABLE public.discovery_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discovery_features public read" ON public.discovery_features FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.discovery_matrix (
  row_id bigint PRIMARY KEY,
  snap_id uuid, symbol text, snapshot_date date, sector text, market_value numeric,
  tgt_lu boolean, lu_days integer, lu_fwd numeric, eval_lu boolean,
  tgt_g10 boolean, g10_days integer, g10_fwd numeric, eval_g10 boolean,
  tgt_g15 boolean, g15_days integer, g15_fwd numeric, eval_g15 boolean,
  tgt_g20 boolean, g20_days integer, g20_fwd numeric, eval_g20 boolean
);
GRANT SELECT ON public.discovery_matrix TO anon, authenticated;
GRANT ALL ON public.discovery_matrix TO service_role;
ALTER TABLE public.discovery_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discovery_matrix public read" ON public.discovery_matrix FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.matrix_flags (
  row_id bigint NOT NULL,
  pred_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS matrix_flags_pred ON public.matrix_flags (pred_key, row_id);
CREATE INDEX IF NOT EXISTS matrix_flags_row ON public.matrix_flags (row_id);
GRANT SELECT ON public.matrix_flags TO anon, authenticated;
GRANT ALL ON public.matrix_flags TO service_role;
ALTER TABLE public.matrix_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matrix_flags public read" ON public.matrix_flags FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.pred_catalog (
  pred_key text PRIMARY KEY,
  label text,
  feature_group text
);
GRANT SELECT ON public.pred_catalog TO anon, authenticated;
GRANT ALL ON public.pred_catalog TO service_role;
ALTER TABLE public.pred_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pred_catalog public read" ON public.pred_catalog FOR SELECT USING (true);

-- =========================================================================
-- 4. AI PATTERNS + RUN HISTORY + META
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ai_patterns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint,
  target_key text NOT NULL,
  horizon integer NOT NULL,
  n_preds integer NOT NULL,
  pred_keys text[] NOT NULL,
  label text,
  occurrences integer, successes integer, failures integer,
  precision_pct numeric, recall_pct numeric, fpr_pct numeric, base_rate_pct numeric, lift numeric,
  avg_fwd numeric, median_fwd numeric, avg_days_to_target numeric,
  z_score numeric, p_value numeric, ci_low numeric, ci_high numeric, significant boolean,
  parent_precision numeric, precision_gain numeric,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_patterns_rank ON public.ai_patterns (target_key, rank);
GRANT SELECT ON public.ai_patterns TO anon, authenticated;
GRANT ALL ON public.ai_patterns TO service_role;
ALTER TABLE public.ai_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_patterns public read" ON public.ai_patterns FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text,
  n_patterns integer,
  n_significant integer
);
GRANT SELECT ON public.ai_runs TO anon, authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_runs public read" ON public.ai_runs FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_signal_quality (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id bigint,
  run_date date,
  target_key text,
  n_patterns integer,
  n_significant integer,
  top_precision numeric,
  top_lift numeric,
  best_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_signal_quality TO anon, authenticated;
GRANT ALL ON public.ai_signal_quality TO service_role;
ALTER TABLE public.ai_signal_quality ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_signal_quality public read" ON public.ai_signal_quality FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_meta (
  id integer PRIMARY KEY DEFAULT 1,
  status text, phase text, current_run_id bigint,
  last_run_at timestamptz, matrix_rows integer, n_patterns integer, n_significant integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_meta TO anon, authenticated;
GRANT ALL ON public.ai_meta TO service_role;
ALTER TABLE public.ai_meta ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_meta public read" ON public.ai_meta FOR SELECT USING (true);
INSERT INTO public.ai_meta(id, status, phase) VALUES (1, 'idle', 'never run')
ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- 5. STATS HELPER: normal CDF
-- =========================================================================
CREATE OR REPLACE FUNCTION public.normal_cdf(x double precision)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE t double precision; d double precision; p double precision;
BEGIN
  IF x IS NULL THEN RETURN NULL; END IF;
  t := 1.0 / (1.0 + 0.2316419 * abs(x));
  d := 0.3989422804014327 * exp(-x * x / 2.0);
  p := d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  IF x > 0 THEN RETURN 1.0 - p; ELSE RETURN p; END IF;
END$$;

-- =========================================================================
-- 6. BUILD DISCOVERY MATRIX
-- =========================================================================
CREATE OR REPLACE FUNCTION public.build_discovery_matrix()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '0' AS $fn$
DECLARE
  _scope date := DATE '2025-01-01';
  _tv80 numeric; _tv90 numeric; _mcap_med numeric; _mcap_p20 numeric; _vol75 numeric; _vol25 numeric;
BEGIN
  PERFORM public.refresh_kap_features();

  TRUNCATE public.discovery_features;
  TRUNCATE public.discovery_matrix;
  TRUNCATE public.matrix_flags;

  INSERT INTO public.discovery_features(
    row_id, snap_id, symbol, snapshot_date, day_index, sector, close, ret,
    vr1, vr2, vr3, vr5, vr20, ret_2d, ret_3d, ret_5d, ret_10d, ret_20d, tv, mcap, kap_count,
    ma20, hi20, lo20, vol20, green_streak, red_streak,
    dist_ma20, dist_hi20, dist_lo20, range20, sec_med_ret20, sec_p75_ret20, kap_category)
  WITH roll AS (
    SELECT ds.id snap_id, ds.symbol, ds.snapshot_date, ds.day_index, ds.close,
      ds.daily_return_pct ret,
      ds.vol_ratio_1d vr1, ds.vol_ratio_2d vr2, ds.vol_ratio_3d vr3, ds.vol_ratio_5d vr5, ds.vol_ratio_20d vr20,
      ds.ret_2d, ds.ret_3d, ds.ret_5d, ds.ret_10d, ds.ret_20d,
      ds.daily_traded_value tv, ds.market_value mcap, ds.kap_count,
      avg(ds.close) OVER w20 ma20,
      max(ds.close) OVER w20 hi20,
      min(ds.close) OVER w20 lo20,
      stddev_samp(ds.daily_return_pct) OVER w20 vol20,
      s.sector
    FROM public.daily_snapshots ds
    JOIN public.stocks s ON s.symbol = ds.symbol
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
  scoped AS (SELECT * FROM st WHERE snapshot_date >= _scope),
  secstats AS (
    SELECT snapshot_date, sector,
      percentile_cont(0.5)  WITHIN GROUP (ORDER BY ret_20d) med,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY ret_20d) p75
    FROM scoped WHERE sector IS NOT NULL GROUP BY snapshot_date, sector
  )
  SELECT row_number() OVER (ORDER BY sc.symbol, sc.snapshot_date),
    sc.snap_id, sc.symbol, sc.snapshot_date, sc.day_index, sc.sector, sc.close, sc.ret,
    sc.vr1, sc.vr2, sc.vr3, sc.vr5, sc.vr20, sc.ret_2d, sc.ret_3d, sc.ret_5d, sc.ret_10d, sc.ret_20d,
    sc.tv, sc.mcap, sc.kap_count, sc.ma20, sc.hi20, sc.lo20, sc.vol20, sc.green_streak, sc.red_streak,
    CASE WHEN sc.ma20 > 0 THEN (sc.close / sc.ma20 - 1) * 100 END,
    CASE WHEN sc.hi20 > 0 THEN (sc.close / sc.hi20 - 1) * 100 END,
    CASE WHEN sc.lo20 > 0 THEN (sc.close / sc.lo20 - 1) * 100 END,
    CASE WHEN sc.close > 0 THEN (sc.hi20 - sc.lo20) / sc.close * 100 END,
    ss.med, ss.p75, kap.category
  FROM scoped sc
  LEFT JOIN secstats ss ON ss.snapshot_date = sc.snapshot_date AND ss.sector = sc.sector
  LEFT JOIN LATERAL (
    SELECT category FROM public.kap_disclosures k
    WHERE k.symbol = sc.symbol AND k.disclosure_date = sc.snapshot_date
    GROUP BY category ORDER BY count(*) DESC LIMIT 1
  ) kap ON true;

  INSERT INTO public.discovery_matrix(
    row_id, snap_id, symbol, snapshot_date, sector, market_value,
    tgt_lu, lu_days, lu_fwd, eval_lu,
    tgt_g10, g10_days, g10_fwd, eval_g10,
    tgt_g15, g15_days, g15_fwd, eval_g15,
    tgt_g20, g20_days, g20_fwd, eval_g20)
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
  ) w;

  SELECT percentile_cont(0.8) WITHIN GROUP (ORDER BY tv),
         percentile_cont(0.9) WITHIN GROUP (ORDER BY tv)
    INTO _tv80, _tv90 FROM public.discovery_features WHERE tv IS NOT NULL;
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY mcap),
         percentile_cont(0.2) WITHIN GROUP (ORDER BY mcap)
    INTO _mcap_med, _mcap_p20 FROM public.discovery_features WHERE mcap IS NOT NULL;
  SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY vol20),
         percentile_cont(0.25) WITHIN GROUP (ORDER BY vol20)
    INTO _vol75, _vol25 FROM public.discovery_features WHERE vol20 IS NOT NULL;

  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT f.row_id, p.pred_key
  FROM public.discovery_features f
  CROSS JOIN LATERAL (VALUES
    ('vr1_ge1_5',  f.vr1 >= 1.5),
    ('vr1_ge2',    f.vr1 >= 2),
    ('vr2_ge1_5',  f.vr2 >= 1.5),
    ('vr2_ge2',    f.vr2 >= 2),
    ('vr3_ge1_5',  f.vr3 >= 1.5),
    ('vr3_ge2',    f.vr3 >= 2),
    ('vr5_ge1_5',  f.vr5 >= 1.5),
    ('vr5_ge2',    f.vr5 >= 2),
    ('vr20_ge2',   f.vr20 >= 2),
    ('vr20_ge3',   f.vr20 >= 3),
    ('vr20_ge5',   f.vr20 >= 5),
    ('vol_accel',  f.vr5 > 0 AND f.vr1 >= f.vr5 * 1.5),
    ('tv_top20',   f.tv >= _tv80),
    ('tv_top10',   f.tv >= _tv90),
    ('mcap_small', f.mcap < _mcap_med),
    ('mcap_micro', f.mcap < _mcap_p20),
    ('vol_high',   f.vol20 >= _vol75),
    ('vol_low',    f.vol20 <= _vol25),
    ('above_ma20',     f.dist_ma20 > 0),
    ('far_above_ma20', f.dist_ma20 >= 10),
    ('near_ma20',      abs(f.dist_ma20) <= 3),
    ('below_ma20',     f.dist_ma20 < 0),
    ('near_high20',    f.dist_hi20 >= -3),
    ('new_high20',     f.dist_hi20 >= 0),
    ('off_low20',      f.dist_lo20 >= 20),
    ('near_low20',     f.dist_lo20 <= 5),
    ('ret2_ge2',   f.ret_2d >= 2),
    ('ret3_ge3',   f.ret_3d >= 3),
    ('ret5_ge5',   f.ret_5d >= 5),
    ('ret5_pos',   f.ret_5d > 0),
    ('ret5_neg',   f.ret_5d < 0),
    ('ret10_ge10', f.ret_10d >= 10),
    ('ret10_pos',  f.ret_10d > 0),
    ('green_ge2',  f.green_streak >= 2),
    ('green_ge3',  f.green_streak >= 3),
    ('red_ge2',    f.red_streak >= 2),
    ('red_ge3',    f.red_streak >= 3),
    ('consolidating', f.range20 <= 10),
    ('rs_pos',     f.ret_20d > f.sec_med_ret20),
    ('rs_strong',  f.ret_20d >= f.sec_p75_ret20),
    ('kap_present', f.kap_count >= 1),
    ('kap_2plus',   f.kap_count >= 2)
  ) p(pred_key, present)
  WHERE p.present;

  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT row_id, 'sector:' || sector FROM public.discovery_features WHERE sector IS NOT NULL;
  INSERT INTO public.matrix_flags(row_id, pred_key)
  SELECT row_id, 'kapcat:' || kap_category FROM public.discovery_features WHERE kap_category IS NOT NULL;

  TRUNCATE public.pred_catalog;
  INSERT INTO public.pred_catalog(pred_key, label, feature_group) VALUES
    ('vr1_ge1_5','1d volume ≥ 1.5× prev','volume'),
    ('vr1_ge2','1d volume ≥ 2× prev','volume'),
    ('vr2_ge1_5','2d volume ≥ 1.5× avg','volume'),
    ('vr2_ge2','2d volume ≥ 2× avg','volume'),
    ('vr3_ge1_5','3d volume ≥ 1.5× avg','volume'),
    ('vr3_ge2','3d volume ≥ 2× avg','volume'),
    ('vr5_ge1_5','5d volume ≥ 1.5× avg','volume'),
    ('vr5_ge2','5d volume ≥ 2× avg','volume'),
    ('vr20_ge2','Volume ≥ 2× 20d avg','volume'),
    ('vr20_ge3','Volume ≥ 3× 20d avg','volume'),
    ('vr20_ge5','Volume ≥ 5× 20d avg','volume'),
    ('vol_accel','Volume accelerating (1d ≥ 1.5× 5d)','volume'),
    ('tv_top20','Traded value top 20%','liquidity'),
    ('tv_top10','Traded value top 10%','liquidity'),
    ('mcap_small','Market cap below median','marketcap'),
    ('mcap_micro','Market cap bottom 20%','marketcap'),
    ('vol_high','High volatility (top 25%)','volatility'),
    ('vol_low','Low volatility (bottom 25%)','volatility'),
    ('above_ma20','Above 20d average','trend'),
    ('far_above_ma20','≥ 10% above 20d average','trend'),
    ('near_ma20','Within 3% of 20d average','trend'),
    ('below_ma20','Below 20d average','trend'),
    ('near_high20','Within 3% of 20d high','trend'),
    ('new_high20','At new 20d high','trend'),
    ('off_low20','≥ 20% above 20d low','trend'),
    ('near_low20','Within 5% of 20d low','trend'),
    ('ret2_ge2','2d return ≥ +2%','momentum'),
    ('ret3_ge3','3d return ≥ +3%','momentum'),
    ('ret5_ge5','5d return ≥ +5%','momentum'),
    ('ret5_pos','5d return positive','momentum'),
    ('ret5_neg','5d return negative (pullback)','momentum'),
    ('ret10_ge10','10d return ≥ +10%','momentum'),
    ('ret10_pos','10d return positive','momentum'),
    ('green_ge2','≥ 2 consecutive green days','streak'),
    ('green_ge3','≥ 3 consecutive green days','streak'),
    ('red_ge2','≥ 2 consecutive red days','streak'),
    ('red_ge3','≥ 3 consecutive red days','streak'),
    ('consolidating','Price consolidating (20d range ≤ 10%)','structure'),
    ('rs_pos','Outperforming sector (20d)','relative_strength'),
    ('rs_strong','Top-quartile in sector (20d)','relative_strength'),
    ('kap_present','KAP disclosure present','kap'),
    ('kap_2plus','≥ 2 KAP disclosures','kap')
  ON CONFLICT (pred_key) DO UPDATE SET label = EXCLUDED.label, feature_group = EXCLUDED.feature_group;

  INSERT INTO public.pred_catalog(pred_key, label, feature_group)
  SELECT DISTINCT 'sector:' || sector, 'Sector: ' || sector, 'sector'
  FROM public.discovery_features WHERE sector IS NOT NULL
  ON CONFLICT (pred_key) DO NOTHING;
  INSERT INTO public.pred_catalog(pred_key, label, feature_group)
  SELECT DISTINCT 'kapcat:' || kap_category, 'KAP: ' || kap_category, 'kap'
  FROM public.discovery_features WHERE kap_category IS NOT NULL
  ON CONFLICT (pred_key) DO NOTHING;
END$fn$;

-- =========================================================================
-- 7. RUN DISCOVERY (singles + pairs + pruned triples, all 4 targets)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.run_ai_discovery(_min_sample integer DEFAULT 40, _min_support integer DEFAULT 25, _run_id bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '0' AS $fn$
DECLARE _top_k integer := 28;
BEGIN
  TRUNCATE public.ai_patterns;

  CREATE TEMP TABLE pact ON COMMIT DROP AS
    SELECT pred_key FROM public.matrix_flags GROUP BY pred_key HAVING count(*) >= _min_support;
  CREATE TEMP TABLE mf ON COMMIT DROP AS
    SELECT m.row_id, m.pred_key FROM public.matrix_flags m JOIN pact USING (pred_key);
  CREATE INDEX ON mf (row_id);
  CREATE INDEX ON mf (pred_key);

  CREATE TEMP TABLE tstat ON COMMIT DROP AS
    SELECT 'lu' tk, count(*) FILTER (WHERE eval_lu) tot, count(*) FILTER (WHERE eval_lu AND tgt_lu) pos FROM public.discovery_matrix
    UNION ALL SELECT 'g10', count(*) FILTER (WHERE eval_g10), count(*) FILTER (WHERE eval_g10 AND tgt_g10) FROM public.discovery_matrix
    UNION ALL SELECT 'g15', count(*) FILTER (WHERE eval_g15), count(*) FILTER (WHERE eval_g15 AND tgt_g15) FROM public.discovery_matrix
    UNION ALL SELECT 'g20', count(*) FILTER (WHERE eval_g20), count(*) FILTER (WHERE eval_g20 AND tgt_g20) FROM public.discovery_matrix;

  CREATE TEMP TABLE combos (
    n_preds int, keys text[],
    occ_lu int, s_lu int, af_lu numeric, mf_lu numeric, ad_lu numeric,
    occ_g10 int, s_g10 int, af_g10 numeric, mf_g10 numeric, ad_g10 numeric,
    occ_g15 int, s_g15 int, af_g15 numeric, mf_g15 numeric, ad_g15 numeric,
    occ_g20 int, s_g20 int, af_g20 numeric, mf_g20 numeric, ad_g20 numeric
  ) ON COMMIT DROP;

  INSERT INTO combos
  SELECT 1, ARRAY[f.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu),
    avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10),
    avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15),
    avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20),
    avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM mf f JOIN public.discovery_matrix m ON m.row_id = f.row_id
  GROUP BY f.pred_key;

  INSERT INTO combos
  SELECT 2, ARRAY[a.pred_key, b.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu),
    avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10),
    avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15),
    avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20),
    avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM mf a JOIN mf b ON a.row_id = b.row_id AND a.pred_key < b.pred_key
  JOIN public.discovery_matrix m ON m.row_id = a.row_id
  GROUP BY a.pred_key, b.pred_key
  HAVING count(*) >= _min_support;

  CREATE TEMP TABLE topp ON COMMIT DROP AS
    SELECT keys[1] pred_key FROM combos WHERE n_preds = 1
    ORDER BY GREATEST(
      coalesce(s_lu::numeric  / NULLIF(occ_lu,0), 0),
      coalesce(s_g10::numeric / NULLIF(occ_g10,0), 0),
      coalesce(s_g15::numeric / NULLIF(occ_g15,0), 0),
      coalesce(s_g20::numeric / NULLIF(occ_g20,0), 0)) DESC NULLS LAST
    LIMIT _top_k;
  CREATE TEMP TABLE mf3 ON COMMIT DROP AS SELECT m.* FROM mf m JOIN topp USING (pred_key);
  CREATE INDEX ON mf3 (row_id);

  INSERT INTO combos
  SELECT 3, ARRAY[a.pred_key, b.pred_key, c.pred_key],
    count(*) FILTER (WHERE m.eval_lu), count(*) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    avg(m.lu_fwd) FILTER (WHERE m.eval_lu), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.lu_fwd) FILTER (WHERE m.eval_lu),
    avg(m.lu_days) FILTER (WHERE m.eval_lu AND m.tgt_lu),
    count(*) FILTER (WHERE m.eval_g10), count(*) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    avg(m.g10_fwd) FILTER (WHERE m.eval_g10), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g10_fwd) FILTER (WHERE m.eval_g10),
    avg(m.g10_days) FILTER (WHERE m.eval_g10 AND m.tgt_g10),
    count(*) FILTER (WHERE m.eval_g15), count(*) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    avg(m.g15_fwd) FILTER (WHERE m.eval_g15), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g15_fwd) FILTER (WHERE m.eval_g15),
    avg(m.g15_days) FILTER (WHERE m.eval_g15 AND m.tgt_g15),
    count(*) FILTER (WHERE m.eval_g20), count(*) FILTER (WHERE m.eval_g20 AND m.tgt_g20),
    avg(m.g20_fwd) FILTER (WHERE m.eval_g20), percentile_cont(0.5) WITHIN GROUP (ORDER BY m.g20_fwd) FILTER (WHERE m.eval_g20),
    avg(m.g20_days) FILTER (WHERE m.eval_g20 AND m.tgt_g20)
  FROM mf3 a
  JOIN mf3 b ON b.row_id = a.row_id AND b.pred_key > a.pred_key
  JOIN mf3 c ON c.row_id = a.row_id AND c.pred_key > b.pred_key
  JOIN public.discovery_matrix m ON m.row_id = a.row_id
  GROUP BY a.pred_key, b.pred_key, c.pred_key
  HAVING count(*) >= _min_support;

  CREATE TEMP TABLE clong ON COMMIT DROP AS
    SELECT n_preds, keys, 'lu' tk, 5 hz, occ_lu occ, s_lu s, af_lu af, mf_lu mfwd, ad_lu ad FROM combos
    UNION ALL SELECT n_preds, keys, 'g10', 5,  occ_g10, s_g10, af_g10, mf_g10, ad_g10 FROM combos
    UNION ALL SELECT n_preds, keys, 'g15', 10, occ_g15, s_g15, af_g15, mf_g15, ad_g15 FROM combos
    UNION ALL SELECT n_preds, keys, 'g20', 20, occ_g20, s_g20, af_g20, mf_g20, ad_g20 FROM combos;

  INSERT INTO public.ai_patterns(
    run_id, target_key, horizon, n_preds, pred_keys, label,
    occurrences, successes, failures,
    precision_pct, recall_pct, fpr_pct, base_rate_pct, lift,
    avg_fwd, median_fwd, avg_days_to_target,
    z_score, p_value, ci_low, ci_high, significant)
  SELECT _run_id, c.tk, c.hz, c.n_preds, c.keys, array_to_string(c.keys, ' + '),
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
    (c.occ >= _min_sample AND z.zv >= 1.96 AND v.base > 0 AND v.phat / NULLIF(v.base,0) >= 1.2)
  FROM clong c
  JOIN tstat ts ON ts.tk = c.tk
  CROSS JOIN LATERAL (SELECT c.s::double precision / NULLIF(c.occ,0) phat,
                             ts.pos::double precision / NULLIF(ts.tot,0) base,
                             c.occ::double precision n) v
  CROSS JOIN LATERAL (SELECT CASE WHEN v.base > 0 AND v.base < 1 AND v.n > 0
                             THEN (v.phat - v.base) / sqrt(v.base * (1 - v.base) / v.n) END zv) z
  WHERE c.occ >= _min_sample;

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
    WHERE p1.n_preds > 1
    GROUP BY p1.id
  ) sub WHERE sub.id = p.id;

  UPDATE public.ai_patterns SET rank = x.r FROM (
    SELECT id, row_number() OVER (PARTITION BY target_key
      ORDER BY significant DESC, lift DESC NULLS LAST, precision_pct DESC NULLS LAST, occurrences DESC) r
    FROM public.ai_patterns
  ) x WHERE public.ai_patterns.id = x.id;

  DELETE FROM public.ai_patterns WHERE rank > 300;
END$fn$;

-- =========================================================================
-- 8. MASTER DRIVER
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ai_discovery_run()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '0' AS $fn$
DECLARE _run_id bigint;
BEGIN
  IF NOT pg_try_advisory_xact_lock(991122) THEN RETURN; END IF;

  INSERT INTO public.ai_runs(started_at, status) VALUES (now(), 'running') RETURNING id INTO _run_id;
  UPDATE public.ai_meta SET status='running', phase='Building feature matrix', current_run_id=_run_id, updated_at=now() WHERE id=1;

  PERFORM public.build_discovery_matrix();
  UPDATE public.ai_meta SET phase='Discovering patterns', matrix_rows=(SELECT count(*) FROM public.discovery_matrix), updated_at=now() WHERE id=1;

  PERFORM public.run_ai_discovery(40, 25, _run_id);
  PERFORM public.build_coverage_report();

  INSERT INTO public.ai_signal_quality(run_id, run_date, target_key, n_patterns, n_significant, top_precision, top_lift, best_label)
  SELECT _run_id, current_date, target_key, count(*), count(*) FILTER (WHERE significant),
         max(precision_pct), max(lift), (array_agg(label ORDER BY rank))[1]
  FROM public.ai_patterns GROUP BY target_key;

  UPDATE public.ai_runs SET finished_at=now(), status='done',
    n_patterns=(SELECT count(*) FROM public.ai_patterns),
    n_significant=(SELECT count(*) FROM public.ai_patterns WHERE significant)
  WHERE id=_run_id;

  UPDATE public.ai_meta SET status='done', phase='Complete', last_run_at=now(), updated_at=now(),
    matrix_rows=(SELECT count(*) FROM public.discovery_matrix),
    n_patterns=(SELECT count(*) FROM public.ai_patterns),
    n_significant=(SELECT count(*) FROM public.ai_patterns WHERE significant)
  WHERE id=1;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='ai_discovery_once') THEN
    PERFORM cron.unschedule('ai_discovery_once');
  END IF;
END$fn$;
