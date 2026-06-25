
-- =========================================================================
-- Incremental AI discovery pipeline: schema
-- =========================================================================

CREATE SEQUENCE IF NOT EXISTS public.ai_row_seq;
ALTER TABLE public.discovery_features ALTER COLUMN row_id SET DEFAULT nextval('public.ai_row_seq');

ALTER TABLE public.ai_patterns ADD COLUMN IF NOT EXISTS overfit boolean;
ALTER TABLE public.ai_patterns ADD COLUMN IF NOT EXISTS robust boolean;

-- Progress tracker (single row id=1)
CREATE TABLE IF NOT EXISTS public.ai_progress (
  id int PRIMARY KEY DEFAULT 1,
  run_id bigint,
  stage text NOT NULL DEFAULT 'idle',
  status text NOT NULL DEFAULT 'idle',
  phase text,
  scope_start date NOT NULL DEFAULT DATE '2025-01-01',
  rows_total bigint NOT NULL DEFAULT 0,
  rows_done bigint NOT NULL DEFAULT 0,
  combos_total bigint NOT NULL DEFAULT 0,
  combos_done bigint NOT NULL DEFAULT 0,
  cursor_pos bigint NOT NULL DEFAULT 0,
  pct numeric NOT NULL DEFAULT 0,
  eta_seconds numeric,
  min_sample int NOT NULL DEFAULT 40,
  min_support int NOT NULL DEFAULT 25,
  error text,
  started_at timestamptz,
  stage_started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.ai_progress(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_symbol_queue (
  symbol text PRIMARY KEY,
  feat_done boolean NOT NULL DEFAULT false,
  matrix_done boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.ai_params (
  id int PRIMARY KEY DEFAULT 1,
  tv80 numeric, tv90 numeric, mcap_med numeric, mcap_p20 numeric, vol75 numeric, vol25 numeric
);
INSERT INTO public.ai_params(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.ai_tstat (
  tk text PRIMARY KEY, tot bigint, pos bigint
);

CREATE TABLE IF NOT EXISTS public.ai_combos (
  id bigserial PRIMARY KEY,
  n_preds int, keys text[],
  occ_lu int, s_lu int, af_lu numeric, mf_lu numeric, ad_lu numeric,
  occ_g10 int, s_g10 int, af_g10 numeric, mf_g10 numeric, ad_g10 numeric,
  occ_g15 int, s_g15 int, af_g15 numeric, mf_g15 numeric, ad_g15 numeric,
  occ_g20 int, s_g20 int, af_g20 numeric, mf_g20 numeric, ad_g20 numeric
);
CREATE INDEX IF NOT EXISTS ai_combos_np ON public.ai_combos(n_preds);

CREATE TABLE IF NOT EXISTS public.ai_mf (row_id bigint, pred_key text);
CREATE INDEX IF NOT EXISTS ai_mf_row ON public.ai_mf(row_id);
CREATE INDEX IF NOT EXISTS ai_mf_pred ON public.ai_mf(pred_key);

CREATE TABLE IF NOT EXISTS public.ai_pred_list (
  pred_key text PRIMARY KEY, ord int, is_top boolean DEFAULT false, ord_top int
);

CREATE TABLE IF NOT EXISTS public.ai_feature_importance (
  id bigserial PRIMARY KEY, target_key text, pred_key text, label text, feature_group text,
  appearances int, avg_precision numeric, avg_lift numeric, best_precision numeric,
  importance numeric, rank int
);

CREATE TABLE IF NOT EXISTS public.ai_backtest_monthly (
  id bigserial PRIMARY KEY, month date, target_key text,
  occurrences int, successes int, precision_pct numeric
);

CREATE TABLE IF NOT EXISTS public.ai_oos_validation (
  id bigserial PRIMARY KEY, target_key text,
  in_sample_precision numeric, oos_precision numeric,
  in_sample_n int, oos_n int, train_period text, test_period text, note text
);

CREATE TABLE IF NOT EXISTS public.ai_top_patterns (
  id bigserial PRIMARY KEY, rank int, target_key text, horizon int, label text,
  pred_keys text[], n_preds int,
  occurrences int, successes int, failures int,
  precision_pct numeric, recall_pct numeric, fpr_pct numeric, base_rate_pct numeric, lift numeric,
  z_score numeric, p_value numeric, ci_low numeric, ci_high numeric,
  avg_fwd numeric, median_fwd numeric, avg_days_to_target numeric,
  overfit boolean, robust boolean
);

CREATE TABLE IF NOT EXISTS public.ai_top_signals (
  id bigserial PRIMARY KEY, rank int, target_key text, horizon int, label text,
  pred_keys text[], occurrences int, precision_pct numeric, lift numeric,
  ci_low numeric, z_score numeric, confidence numeric
);

CREATE TABLE IF NOT EXISTS public.ai_pattern_rows (pattern_id bigint, row_id bigint);
CREATE INDEX IF NOT EXISTS ai_pr_pat ON public.ai_pattern_rows(pattern_id);
CREATE INDEX IF NOT EXISTS ai_pr_row ON public.ai_pattern_rows(row_id);

CREATE TABLE IF NOT EXISTS public.ai_watchlist (
  id bigserial PRIMARY KEY, score_date date, symbol text, company_name text, sector text,
  probability numeric, confidence numeric, matched_patterns int, matched_labels text[],
  best_target text, hist_success_pct numeric, rank int, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_wl_date ON public.ai_watchlist(score_date);

-- Grants + RLS (public research data, read-only to clients)
DO $g$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ai_progress','ai_symbol_queue','ai_params','ai_tstat','ai_combos','ai_mf','ai_pred_list',
    'ai_feature_importance','ai_backtest_monthly','ai_oos_validation','ai_top_patterns',
    'ai_top_signals','ai_pattern_rows','ai_watchlist'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true);', t||'_read', t);
  END LOOP;
END$g$;
GRANT USAGE, SELECT ON SEQUENCE public.ai_row_seq TO service_role;
