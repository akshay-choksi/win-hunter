-- Mark The Open Championship completed so the UI prefers the next open event (3M).
-- Prefer Admin → Finalize Event when you want season FedEx points awarded.
-- Use this only if you are done testing Open live scoring and want the board to
-- default to 3M without running finalize (no season points awarded).

DO $$
DECLARE
  v_open uuid := '1b07ba5a-b618-43a8-965d-22540c5e4e70'; -- The Open Championship
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = v_open) THEN
    RAISE EXCEPTION 'The Open tournament % not found', v_open;
  END IF;

  UPDATE public.tournaments
  SET status = 'completed'
  WHERE id = v_open
    AND status <> 'completed';

  RAISE NOTICE 'The Open marked completed (no FedEx awards). Use Finalize Event instead if you want season points.';
END $$;
