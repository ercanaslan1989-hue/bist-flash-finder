
DO $$
DECLARE
  v_symbols TEXT[] := ARRAY[
    'THYAO','GARAN','AKBNK','ISCTR','YKBNK','SISE','EREGL','KRDMD','ASELS','TUPRS',
    'KCHOL','SAHOL','BIMAS','MGROS','SOKM','FROTO','TOASO','PETKM','TCELL','TTKOM',
    'PGSUS','HEKTS','KOZAL','KOZAA','TKFEN','ENKAI','VESTL','ARCLK','ALARK','DOHOL',
    'ODAS','SASA','GUBRF','EKGYO','HALKB','VAKBN','TAVHL','OYAKC','CIMSA','AKSEN',
    'ZOREN','SMRTG','BRSAN','KONTR','ASTOR'
  ];
  v_names TEXT[] := ARRAY[
    'Turk Hava Yollari','Garanti Bankasi','Akbank','Is Bankasi C','Yapi Kredi Bankasi','Sisecam','Eregli Demir Celik','Kardemir D','Aselsan','Tupras',
    'Koc Holding','Sabanci Holding','BIM Magazalar','Migros Ticaret','Sok Marketler','Ford Otosan','Tofas Oto','Petkim','Turkcell','Turk Telekom',
    'Pegasus','Hektas','Koza Altin','Koza Anadolu','Tekfen Holding','Enka Insaat','Vestel','Arcelik','Alarko Holding','Dogan Holding',
    'Odas Elektrik','Sasa Polyester','Gubre Fabrik','Emlak GYO','Halkbank','Vakifbank','TAV Havalimanlari','Oyak Cimento','Cimsa','Aksa Enerji',
    'Zorlu Enerji','Smart Gunes','Borusan Boru','Kontrolmatik','Astor Enerji'
  ];
  v_sectors TEXT[] := ARRAY[
    'Aviation','Banking','Banking','Banking','Banking','Industrials','Metals','Metals','Defense','Energy',
    'Holding','Holding','Retail','Retail','Retail','Automotive','Automotive','Chemicals','Telecom','Telecom',
    'Aviation','Chemicals','Mining','Mining','Holding','Construction','Technology','Technology','Holding','Holding',
    'Energy','Chemicals','Chemicals','REIT','Banking','Banking','Aviation','Construction','Construction','Energy',
    'Energy','Technology','Metals','Technology','Energy'
  ];
  v_trading_dates DATE[];
  n_days INT := 120;
  i INT;
  d INT;
  k INT;
  sym TEXT;
  base_price NUMERIC;
  shares BIGINT;
  base_vol NUMERIC;
  is_spike BOOLEAN[];
  spike_val NUMERIC[];
  n_spikes INT;
  pos INT;
  cur_close NUMERIC;
  ret NUMERIC;
  vol_factor NUMERIC;
  vol BIGINT;
  kap INT;
  last_kap DATE;
BEGIN
  -- Build the last n_days weekdays as the trading calendar
  SELECT array_agg(dt ORDER BY dt) INTO v_trading_dates
  FROM (
    SELECT dt FROM generate_series(CURRENT_DATE - INTERVAL '260 days', CURRENT_DATE, '1 day') AS g(dt)
    WHERE EXTRACT(DOW FROM dt) NOT IN (0,6)
    ORDER BY dt DESC
    LIMIT 120
  ) s;

  FOR i IN 1 .. array_length(v_symbols,1) LOOP
    sym := v_symbols[i];
    base_price := 5 + random()*195;
    shares := (50000000 + floor(random()*950000000))::BIGINT;
    base_vol := 200000 + random()*4800000;

    INSERT INTO public.stocks(symbol, company_name, sector, shares_outstanding)
    VALUES (sym, v_names[i], v_sectors[i], shares);

    -- plan spikes (large-move days) within range that leaves history before them
    is_spike := array_fill(false, ARRAY[n_days]);
    spike_val := array_fill(0::NUMERIC, ARRAY[n_days]);
    n_spikes := floor(random()*3)::INT; -- 0,1,2
    FOR k IN 1 .. n_spikes LOOP
      pos := 40 + floor(random()*78)::INT; -- 40..117
      is_spike[pos] := true;
      spike_val[pos] := 10 + random()*12; -- 10%..22%
    END LOOP;

    cur_close := base_price;
    last_kap := NULL;

    FOR d IN 1 .. n_days LOOP
      IF d = 1 THEN
        ret := 0;
      ELSIF is_spike[d] THEN
        ret := spike_val[d];
      ELSE
        ret := (random()+random()+random()-1.5)*2.2; -- ~normal, roughly -3.3..3.3
      END IF;

      IF d > 1 THEN
        cur_close := cur_close * (1 + ret/100.0);
      END IF;
      IF cur_close < 1 THEN cur_close := 1; END IF;

      -- volume build-up before upcoming spikes + huge volume on spike day
      vol_factor := 0.8 + random()*0.4;
      FOR k IN 1 .. 5 LOOP
        IF d+k <= n_days AND is_spike[d+k] THEN
          vol_factor := GREATEST(vol_factor, (1 + (6-k)*0.35) * (0.7 + random()*0.8));
        END IF;
      END LOOP;
      IF is_spike[d] THEN
        vol_factor := vol_factor * (3 + random()*3);
      END IF;
      vol := GREATEST(1000, round(base_vol * vol_factor))::BIGINT;

      -- KAP announcements: usually low, elevated just before spikes
      kap := CASE WHEN random() < 0.12 THEN 1 ELSE 0 END;
      FOR k IN 1 .. 3 LOOP
        IF d+k <= n_days AND is_spike[d+k] AND random() < 0.6 THEN
          kap := kap + 1;
        END IF;
      END LOOP;
      IF is_spike[d] AND random() < 0.5 THEN kap := kap + 1; END IF;
      IF kap > 0 THEN last_kap := v_trading_dates[d]; END IF;

      INSERT INTO public.daily_snapshots(
        snapshot_date, day_index, symbol, close, volume, kap_count, last_kap_date
      ) VALUES (
        v_trading_dates[d], d, sym, round(cur_close,4), vol, kap, last_kap
      );
    END LOOP;
  END LOOP;
END $$;

-- Derived metrics via window functions
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

UPDATE public.daily_snapshots ds
SET market_value = round(ds.close * s.shares_outstanding, 2),
    daily_traded_value = round(ds.close * ds.volume, 2)
FROM public.stocks s WHERE s.symbol = ds.symbol;

-- Detect large-move events (+10/+15/+20 and limit-up ~ +10% BIST cap)
INSERT INTO public.events(symbol, event_date, event_type, is_limit_up, daily_return_pct, sector)
SELECT ds.symbol, ds.snapshot_date,
  CASE WHEN ds.daily_return_pct >= 20 THEN 'gain_20'
       WHEN ds.daily_return_pct >= 15 THEN 'gain_15'
       ELSE 'gain_10' END,
  (ds.daily_return_pct >= 9.7 AND ds.daily_return_pct <= 10.5),
  ds.daily_return_pct,
  s.sector
FROM public.daily_snapshots ds
JOIN public.stocks s ON s.symbol = ds.symbol
WHERE ds.daily_return_pct >= 10
ON CONFLICT (symbol, event_date) DO NOTHING;

-- Capture pre-event features at 1,2,3,5,10 trading days before
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
