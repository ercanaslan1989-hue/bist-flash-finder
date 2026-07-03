ALTER TABLE public.daily_snapshots
  ADD COLUMN IF NOT EXISTS open numeric,
  ADD COLUMN IF NOT EXISTS high numeric,
  ADD COLUMN IF NOT EXISTS low numeric,
  ADD COLUMN IF NOT EXISTS adj_close numeric;