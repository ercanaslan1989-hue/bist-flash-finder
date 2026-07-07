
CREATE TABLE public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text,
  status text NOT NULL DEFAULT 'completed',
  start_date date,
  end_date date,
  universe_size integer,
  min_score numeric,
  horizons integer[],
  total_predictions integer,
  params jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.backtest_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  strategy_id text NOT NULL,
  strategy_label text,
  horizon integer NOT NULL DEFAULT 5,
  signals integer,
  hit_rate numeric,
  avg_return numeric,
  median_return numeric,
  profit_factor numeric,
  max_drawdown numeric,
  sharpe numeric,
  avg_holding numeric,
  best_streak integer,
  worst_streak integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.backtest_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.backtest_runs(id) ON DELETE CASCADE,
  strategy_id text NOT NULL,
  symbol text NOT NULL,
  signal_date date NOT NULL,
  entry_close numeric,
  score numeric,
  ret_1d numeric,
  ret_3d numeric,
  ret_5d numeric,
  ret_10d numeric,
  ret_20d numeric,
  max_ret numeric,
  hit boolean,
  days_to_hit integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backtest_metrics_run ON public.backtest_metrics(run_id);
CREATE INDEX idx_backtest_predictions_run ON public.backtest_predictions(run_id);
CREATE INDEX idx_backtest_predictions_signal_date ON public.backtest_predictions(signal_date DESC);

GRANT SELECT, INSERT ON public.backtest_runs TO anon, authenticated;
GRANT SELECT, INSERT ON public.backtest_metrics TO anon, authenticated;
GRANT SELECT, INSERT ON public.backtest_predictions TO anon, authenticated;
GRANT ALL ON public.backtest_runs TO service_role;
GRANT ALL ON public.backtest_metrics TO service_role;
GRANT ALL ON public.backtest_predictions TO service_role;

ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backtest runs are public readable" ON public.backtest_runs FOR SELECT USING (true);
CREATE POLICY "Anyone can create backtest runs" ON public.backtest_runs FOR INSERT WITH CHECK (true);

CREATE POLICY "Backtest metrics are public readable" ON public.backtest_metrics FOR SELECT USING (true);
CREATE POLICY "Anyone can create backtest metrics" ON public.backtest_metrics FOR INSERT WITH CHECK (true);

CREATE POLICY "Backtest predictions are public readable" ON public.backtest_predictions FOR SELECT USING (true);
CREATE POLICY "Anyone can create backtest predictions" ON public.backtest_predictions FOR INSERT WITH CHECK (true);
