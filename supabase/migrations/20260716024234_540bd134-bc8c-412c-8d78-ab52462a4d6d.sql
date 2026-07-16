GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.golfers TO authenticated;
GRANT ALL ON public.golfers TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;

GRANT SELECT, INSERT, DELETE ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lineups TO authenticated;
GRANT ALL ON public.lineups TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lineup_entries TO authenticated;
GRANT ALL ON public.lineup_entries TO service_role;