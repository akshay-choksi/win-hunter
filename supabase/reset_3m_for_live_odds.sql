-- Reset 3M Open for a live DataGolf Sync Odds pull (friend beta).
-- Clears prices cloned from The Open demo seed and any draft lineups/results.
-- After running: Admin → Sync Tournament Odds once DataGolf's current field is 3M Open.
-- Safe to re-run.

DO $$
DECLARE
  v_3m uuid := '27ecdd9f-52fd-4209-94ff-1c427eff4ce5'; -- 3M Open
  v_prices int;
  v_lineups int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = v_3m) THEN
    RAISE EXCEPTION '3M Open tournament % not found', v_3m;
  END IF;

  DELETE FROM public.lineup_entries
  WHERE lineup_id IN (
    SELECT id FROM public.lineups WHERE tournament_id = v_3m
  );

  DELETE FROM public.lineups WHERE tournament_id = v_3m;
  GET DIAGNOSTICS v_lineups = ROW_COUNT;

  DELETE FROM public.player_results WHERE tournament_id = v_3m;

  DELETE FROM public.player_prices WHERE tournament_id = v_3m;
  GET DIAGNOSTICS v_prices = ROW_COUNT;

  DELETE FROM public.result_sync_state WHERE tournament_id = v_3m;

  UPDATE public.tournaments
  SET status = 'scheduled'
  WHERE id = v_3m;

  RAISE NOTICE '3M Open reset: removed % lineups, % prices; status=scheduled. Run Admin Sync Odds when DataGolf field is 3M.',
    v_lineups, v_prices;
END $$;
