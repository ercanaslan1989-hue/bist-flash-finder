DROP PROCEDURE IF EXISTS public.research_drive(int);

CREATE OR REPLACE FUNCTION public.research_drive(_batch int DEFAULT 10)
RETURNS TABLE(processed int, remaining int, done boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sym text; _n int := 0; _r int; _lu int; _ru int; _f int;
BEGIN
  processed := 0; remaining := 0; done := false;

  IF NOT pg_try_advisory_xact_lock(778899) THEN
    SELECT count(*) INTO remaining FROM public.research_queue WHERE status <> 'done';
    done := (remaining = 0);
    RETURN NEXT; RETURN;
  END IF;

  UPDATE public.research_progress
    SET status='running', phase='Phase 1-5: per-stock compute', updated_at=now()
    WHERE id=1 AND status <> 'done';

  WHILE _n < _batch LOOP
    SELECT symbol INTO _sym FROM public.research_queue
      WHERE status='pending' ORDER BY symbol LIMIT 1;
    EXIT WHEN _sym IS NULL;

    UPDATE public.research_queue SET status='processing' WHERE symbol=_sym;
    SELECT rows_done, lu, run20, feats INTO _r,_lu,_ru,_f FROM public.process_stock(_sym);
    UPDATE public.research_queue
      SET status='done', n_rows=_r, limit_up=_lu, run20=_ru, processed_at=now(), error=NULL
      WHERE symbol=_sym;

    UPDATE public.research_progress SET
      stocks_done = stocks_done + 1,
      rows_processed = rows_processed + _r,
      limit_up_events = limit_up_events + _lu,
      run20_events = run20_events + _ru,
      features_generated = features_generated + _f,
      updated_at = now()
    WHERE id=1;

    _n := _n + 1;
  END LOOP;

  processed := _n;
  SELECT count(*) INTO remaining FROM public.research_queue WHERE status <> 'done';

  IF remaining = 0 THEN
    UPDATE public.research_progress SET phase='Phase 6: building research tables', updated_at=now() WHERE id=1;
    PERFORM public.build_research_aggregates();
    UPDATE public.research_progress SET status='done', phase='Complete', updated_at=now() WHERE id=1;
    done := true;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='research_drive') THEN
      PERFORM cron.unschedule('research_drive');
    END IF;
  END IF;

  RETURN NEXT;
END$$;
REVOKE EXECUTE ON FUNCTION public.research_drive(int) FROM PUBLIC, anon, authenticated;