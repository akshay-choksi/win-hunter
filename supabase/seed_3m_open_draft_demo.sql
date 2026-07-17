-- Demo: open 3M Open for lineup drafting (prices cloned from The Open Championship).
-- Keeps The Open as in_progress for live leaderboard screenshots.
-- Re-runnable.

DO $$
DECLARE
  v_open uuid := '1b07ba5a-b618-43a8-965d-22540c5e4e70'; -- The Open Championship
  v_demo uuid := '27ecdd9f-52fd-4209-94ff-1c427eff4ce5'; -- 3M Open
  v_copied int;
BEGIN
  -- Keep Open live for leaderboard demos
  UPDATE public.tournaments
  SET status = 'in_progress'
  WHERE id = v_open;

  -- Open 3M for drafting; lock far enough out for screenshots/video
  UPDATE public.tournaments
  SET
    status = 'open',
    lineup_lock_at = now() + interval '7 days',
    start_date = CURRENT_DATE + 7,
    end_date = CURRENT_DATE + 10
  WHERE id = v_demo;

  -- Clone salaries / odds from The Open field
  INSERT INTO public.player_prices (
    tournament_id, golfer_id, salary, decimal_odds, implied_prob
  )
  SELECT
    v_demo,
    pp.golfer_id,
    pp.salary,
    pp.decimal_odds,
    pp.implied_prob
  FROM public.player_prices pp
  WHERE pp.tournament_id = v_open
  ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
    salary = EXCLUDED.salary,
    decimal_odds = EXCLUDED.decimal_odds,
    implied_prob = EXCLUDED.implied_prob,
    updated_at = now();

  GET DIAGNOSTICS v_copied = ROW_COUNT;
  RAISE NOTICE '3M Open opened; copied/updated % player_prices from The Open', v_copied;
END $$;
