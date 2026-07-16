-- Reject lineup mutations after contest lock (first tee / lineup_lock_at)

CREATE OR REPLACE FUNCTION public.enforce_lineup_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
  lock_at timestamptz;
  t_status public.tournament_status;
BEGIN
  -- service_role bypass (edge functions / admin sync may update points after lock)
  IF coalesce(auth.role(), current_setting('request.jwt.claim.role', true)) = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'lineups' THEN
    tid := COALESCE(NEW.tournament_id, OLD.tournament_id);
  ELSE
    -- lineup_entries: resolve tournament via lineup
    SELECT l.tournament_id INTO tid
    FROM public.lineups l
    WHERE l.id = COALESCE(NEW.lineup_id, OLD.lineup_id);
  END IF;

  IF tid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT lineup_lock_at, status INTO lock_at, t_status
  FROM public.tournaments
  WHERE id = tid;

  IF t_status IN ('in_progress', 'completed')
     OR (lock_at IS NOT NULL AND now() >= lock_at) THEN
    RAISE EXCEPTION 'Lineups are locked for this tournament'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_lineups_lock ON public.lineups;
CREATE TRIGGER trg_lineups_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.lineups
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lineup_lock();

DROP TRIGGER IF EXISTS trg_lineup_entries_lock ON public.lineup_entries;
CREATE TRIGGER trg_lineup_entries_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.lineup_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lineup_lock();
