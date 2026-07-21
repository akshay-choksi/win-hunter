-- Persist per-event season awards and placement counters.

ALTER TABLE public.lineups
  ADD COLUMN IF NOT EXISTS league_finish integer,
  ADD COLUMN IF NOT EXISTS season_points numeric NOT NULL DEFAULT 0;

ALTER TABLE public.season_standings
  ADD COLUMN IF NOT EXISTS wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top5s integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lineups.league_finish IS 'Dense-rank finish within the league at Finalize Event; null until finalized.';
COMMENT ON COLUMN public.lineups.season_points IS 'FedEx-style season points awarded for this event at Finalize.';
COMMENT ON COLUMN public.season_standings.wins IS 'Count of league event finishes = 1.';
COMMENT ON COLUMN public.season_standings.top5s IS 'Count of league event finishes 1–5.';
