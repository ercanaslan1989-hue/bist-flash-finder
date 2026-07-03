create or replace function public.apply_ohlc(rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare updated int;
begin
  update public.daily_snapshots ds
  set open = nullif(r->>'open','')::numeric,
      high = nullif(r->>'high','')::numeric,
      low = nullif(r->>'low','')::numeric,
      adj_close = nullif(r->>'adj_close','')::numeric
  from jsonb_array_elements(rows) as r
  where ds.symbol = r->>'symbol'
    and ds.snapshot_date = (r->>'date')::date;
  get diagnostics updated = row_count;
  return updated;
end;
$$;
revoke all on function public.apply_ohlc(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ohlc(jsonb) to service_role;