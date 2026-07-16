-- Event-based fantasy: tournaments, prices, results, FedEx standings, scoring

-- Enums
CREATE TYPE public.tournament_event_type AS ENUM ('standard', 'signature', 'major');
CREATE TYPE public.tournament_status AS ENUM ('scheduled', 'open', 'in_progress', 'completed');

-- TOURNAMENTS
CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dg_event_id text NOT NULL UNIQUE,
  name text NOT NULL,
  start_date date,
  end_date date,
  season_year integer NOT NULL,
  event_type public.tournament_event_type NOT NULL DEFAULT 'standard',
  fedex_multiplier numeric NOT NULL DEFAULT 1.0,
  status public.tournament_status NOT NULL DEFAULT 'scheduled',
  lineup_lock_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tournaments TO authenticated;
GRANT ALL ON public.tournaments TO service_role;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournaments: auth read" ON public.tournaments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tournaments: admin write" ON public.tournaments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_tournaments_updated
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Golfers: canonical DataGolf player id
ALTER TABLE public.golfers
  ADD COLUMN IF NOT EXISTS dg_player_id text;
CREATE UNIQUE INDEX IF NOT EXISTS golfers_dg_player_id_key
  ON public.golfers (dg_player_id);

-- Clear legacy one-lineup-per-league data before event-scoped lineups
DELETE FROM public.lineup_entries;
DELETE FROM public.lineups;

ALTER TABLE public.lineups DROP CONSTRAINT IF EXISTS lineups_league_id_user_id_key;
ALTER TABLE public.lineups
  ADD COLUMN tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  ADD COLUMN total_points numeric NOT NULL DEFAULT 0;
ALTER TABLE public.lineups
  ADD CONSTRAINT lineups_league_user_tournament_key UNIQUE (league_id, user_id, tournament_id);

CREATE INDEX IF NOT EXISTS lineups_tournament_id_idx ON public.lineups (tournament_id);
CREATE INDEX IF NOT EXISTS lineups_league_tournament_idx ON public.lineups (league_id, tournament_id);

-- PLAYER PRICES (odds-derived salaries per event)
CREATE TABLE public.player_prices (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  golfer_id uuid NOT NULL REFERENCES public.golfers(id) ON DELETE CASCADE,
  salary integer NOT NULL DEFAULT 0,
  decimal_odds numeric,
  implied_prob numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, golfer_id)
);
GRANT SELECT ON public.player_prices TO authenticated;
GRANT ALL ON public.player_prices TO service_role;
ALTER TABLE public.player_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player prices: auth read" ON public.player_prices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Player prices: admin write" ON public.player_prices
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_player_prices_updated
  BEFORE UPDATE ON public.player_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PLAYER RESULTS (live + final scoring inputs)
CREATE TABLE public.player_results (
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  golfer_id uuid NOT NULL REFERENCES public.golfers(id) ON DELETE CASCADE,
  position integer,
  made_cut boolean NOT NULL DEFAULT false,
  total_to_par integer,
  birdies integer NOT NULL DEFAULT 0,
  eagles integer NOT NULL DEFAULT 0,
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  fantasy_points numeric NOT NULL DEFAULT 0,
  status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, golfer_id)
);
GRANT SELECT ON public.player_results TO authenticated;
GRANT ALL ON public.player_results TO service_role;
ALTER TABLE public.player_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player results: auth read" ON public.player_results
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Player results: admin write" ON public.player_results
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_player_results_updated
  BEFORE UPDATE ON public.player_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEASON STANDINGS (FedEx-style accumulation per league)
CREATE TABLE public.season_standings (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  fedex_points numeric NOT NULL DEFAULT 0,
  events_played integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id, season_year)
);
GRANT SELECT ON public.season_standings TO authenticated;
GRANT ALL ON public.season_standings TO service_role;
ALTER TABLE public.season_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Season standings: members read" ON public.season_standings
  FOR SELECT TO authenticated
  USING (public.is_league_member(league_id, auth.uid()));

CREATE TRIGGER trg_season_standings_updated
  BEFORE UPDATE ON public.season_standings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- FEDEX PAYOUT TABLE (league finish -> FedEx points)
CREATE TABLE public.fedex_payout (
  finish_position integer PRIMARY KEY CHECK (finish_position >= 1),
  points numeric NOT NULL CHECK (points >= 0)
);
GRANT SELECT ON public.fedex_payout TO authenticated;
GRANT ALL ON public.fedex_payout TO service_role;
ALTER TABLE public.fedex_payout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "FedEx payout: auth read" ON public.fedex_payout
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "FedEx payout: admin write" ON public.fedex_payout
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.fedex_payout (finish_position, points) VALUES
  (1, 500), (2, 300), (3, 190), (4, 135), (5, 110),
  (6, 100), (7, 90), (8, 85), (9, 80), (10, 75),
  (11, 70), (12, 65), (13, 60), (14, 55), (15, 50),
  (16, 48), (17, 46), (18, 44), (19, 42), (20, 40),
  (21, 38), (22, 36), (23, 34), (24, 32), (25, 30),
  (26, 28), (27, 26), (28, 24), (29, 22), (30, 20)
ON CONFLICT (finish_position) DO NOTHING;

-- Round-based fantasy scoring
CREATE OR REPLACE FUNCTION public.compute_fantasy_points(
  _position integer,
  _made_cut boolean,
  _total_to_par integer,
  _birdies integer,
  _eagles integer
) RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pts numeric := 0;
  finish_pts numeric := 0;
BEGIN
  IF COALESCE(_made_cut, false) THEN
    pts := pts + 10;
  END IF;

  IF _position IS NOT NULL THEN
    IF _position = 1 THEN finish_pts := 50;
    ELSIF _position = 2 THEN finish_pts := 40;
    ELSIF _position = 3 THEN finish_pts := 35;
    ELSIF _position BETWEEN 4 AND 5 THEN finish_pts := 28;
    ELSIF _position BETWEEN 6 AND 10 THEN finish_pts := 20;
    ELSIF _position BETWEEN 11 AND 20 THEN finish_pts := 12;
    ELSIF _position BETWEEN 21 AND 30 THEN finish_pts := 8;
    ELSIF COALESCE(_made_cut, false) THEN finish_pts := 4;
    END IF;
  ELSIF COALESCE(_made_cut, false) THEN
    finish_pts := 4;
  END IF;
  pts := pts + finish_pts;

  pts := pts + GREATEST(COALESCE(_birdies, 0), 0) * 1;
  pts := pts + GREATEST(COALESCE(_eagles, 0), 0) * 3;

  IF _total_to_par IS NOT NULL AND _total_to_par < 0 THEN
    pts := pts + ABS(_total_to_par);
  END IF;

  RETURN pts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_fantasy_points(integer, boolean, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_fantasy_points(integer, boolean, integer, integer, integer) TO service_role;

-- Realtime for live boards
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_results;
ALTER PUBLICATION supabase_realtime ADD TABLE public.season_standings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
