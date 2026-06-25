-- 1. Engine version freeze marker
CREATE TABLE IF NOT EXISTS public.ai_engine_version (
  id int PRIMARY KEY DEFAULT 1,
  version text NOT NULL,
  frozen boolean NOT NULL DEFAULT true,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  stages text NOT NULL,
  notes text,
  CONSTRAINT ai_engine_version_singleton CHECK (id = 1)
);
GRANT SELECT ON public.ai_engine_version TO anon, authenticated;
GRANT ALL ON public.ai_engine_version TO service_role;
ALTER TABLE public.ai_engine_version ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_engine_version_read ON public.ai_engine_version;
CREATE POLICY ai_engine_version_read ON public.ai_engine_version FOR SELECT USING (true);

INSERT INTO public.ai_engine_version(id,version,frozen,stages,notes)
VALUES (1,'1.0',true,
  'reset|features|secstats|matrix|params|flags|predcatalog|single|pair|triple|validate|quality|oos|backtest',
  'Statistical research core frozen. Research window 2025-01-01 -> today; OOS split train=2025 / test=2026. No buy/sell recommendations. Future feeds (KAP, Telegram, X, insider, funds, free-float, financials) plug in as new pred_catalog flags without altering the statistical core.')
ON CONFLICT (id) DO UPDATE SET version=excluded.version, frozen=true, frozen_at=now(),
  stages=excluded.stages, notes=excluded.notes;

-- 2. Walk-forward monthly replay results
CREATE TABLE IF NOT EXISTS public.ai_walkforward_monthly (
  id bigserial PRIMARY KEY,
  month date NOT NULL,
  n_signals int NOT NULL,
  precision_pct numeric,
  avg_fwd_return numeric,
  hit_rate_pos numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_walkforward_monthly TO anon, authenticated;
GRANT ALL ON public.ai_walkforward_monthly TO service_role;
ALTER TABLE public.ai_walkforward_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_wf_monthly_read ON public.ai_walkforward_monthly;
CREATE POLICY ai_wf_monthly_read ON public.ai_walkforward_monthly FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.ai_walkforward_summary (
  id int PRIMARY KEY DEFAULT 1,
  total_signals int,
  overall_precision numeric,
  avg_monthly_precision numeric,
  best_month date,
  best_month_precision numeric,
  worst_month date,
  worst_month_precision numeric,
  avg_fwd_return numeric,
  hit_rate numeric,
  calib_low_pred numeric,
  calib_low_actual numeric,
  calib_high_pred numeric,
  calib_high_actual numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_wf_summary_singleton CHECK (id = 1)
);
GRANT SELECT ON public.ai_walkforward_summary TO anon, authenticated;
GRANT ALL ON public.ai_walkforward_summary TO service_role;
ALTER TABLE public.ai_walkforward_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_wf_summary_read ON public.ai_walkforward_summary;
CREATE POLICY ai_wf_summary_read ON public.ai_walkforward_summary FOR SELECT USING (true);

-- 3. Builder function for the walk-forward replay
CREATE OR REPLACE FUNCTION public.ai_build_walkforward()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '0'
AS $function$
BEGIN
  CREATE TEMP TABLE _wf ON COMMIT DROP AS
  SELECT m.symbol, m.snapshot_date AS d, tp.target_key, tp.precision_pct,
    (CASE tp.target_key WHEN 'lu' THEN m.tgt_lu WHEN 'g10' THEN m.tgt_g10 WHEN 'g15' THEN m.tgt_g15 ELSE m.tgt_g20 END) AS hit,
    (CASE tp.target_key WHEN 'lu' THEN m.lu_fwd WHEN 'g10' THEN m.g10_fwd WHEN 'g15' THEN m.g15_fwd ELSE m.g20_fwd END) AS fwd,
    row_number() OVER (PARTITION BY m.symbol, m.snapshot_date ORDER BY tp.precision_pct DESC NULLS LAST) rn
  FROM public.ai_pattern_rows pr
  JOIN public.ai_top_patterns tp ON tp.id=pr.pattern_id
  JOIN public.discovery_matrix m ON m.row_id=pr.row_id;

  TRUNCATE public.ai_walkforward_monthly;
  INSERT INTO public.ai_walkforward_monthly(month,n_signals,precision_pct,avg_fwd_return,hit_rate_pos)
  SELECT date_trunc('month',d)::date, count(*),
    round(100.0*count(*) FILTER (WHERE hit)/count(*),2),
    round(avg(fwd),2),
    round(100.0*count(*) FILTER (WHERE fwd>0)/count(*),2)
  FROM _wf WHERE rn=1 GROUP BY 1;

  DELETE FROM public.ai_walkforward_summary;
  INSERT INTO public.ai_walkforward_summary(id,total_signals,overall_precision,avg_monthly_precision,
    best_month,best_month_precision,worst_month,worst_month_precision,avg_fwd_return,hit_rate,
    calib_low_pred,calib_low_actual,calib_high_pred,calib_high_actual)
  SELECT 1,
    (SELECT count(*) FROM _wf WHERE rn=1),
    (SELECT round(100.0*count(*) FILTER (WHERE hit)/count(*),2) FROM _wf WHERE rn=1),
    (SELECT round(avg(precision_pct),2) FROM public.ai_walkforward_monthly),
    (SELECT month FROM public.ai_walkforward_monthly ORDER BY precision_pct DESC NULLS LAST LIMIT 1),
    (SELECT max(precision_pct) FROM public.ai_walkforward_monthly),
    (SELECT month FROM public.ai_walkforward_monthly ORDER BY precision_pct ASC NULLS LAST LIMIT 1),
    (SELECT min(precision_pct) FROM public.ai_walkforward_monthly),
    (SELECT round(avg(fwd),2) FROM _wf WHERE rn=1),
    (SELECT round(100.0*count(*) FILTER (WHERE fwd>0)/count(*),2) FROM _wf WHERE rn=1),
    (SELECT round(avg(precision_pct),1) FROM _wf WHERE rn=1 AND precision_pct < 35),
    (SELECT round(100.0*count(*) FILTER (WHERE hit)/count(*),1) FROM _wf WHERE rn=1 AND precision_pct < 35),
    (SELECT round(avg(precision_pct),1) FROM _wf WHERE rn=1 AND precision_pct >= 35),
    (SELECT round(100.0*count(*) FILTER (WHERE hit)/count(*),1) FROM _wf WHERE rn=1 AND precision_pct >= 35);
END$function$;

SELECT public.ai_build_walkforward();