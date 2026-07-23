-- Lock lineups by time (lineup_lock_at) or completed status only.
-- Do not treat in_progress as locked — Sync Odds may set that when DataGolf
-- reports a live round while the draft window is still open.

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

  IF t_status = 'completed'
     OR (lock_at IS NOT NULL AND now() >= lock_at) THEN
    RAISE EXCEPTION 'Lineups are locked for this tournament'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
