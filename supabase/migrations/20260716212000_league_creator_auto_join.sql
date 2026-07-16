-- Always add league creator as a member (UI should not be the only path)
CREATE OR REPLACE FUNCTION public.add_league_creator_as_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.league_members (league_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_league_add_creator ON public.leagues;
CREATE TRIGGER trg_league_add_creator
  AFTER INSERT ON public.leagues
  FOR EACH ROW
  EXECUTE FUNCTION public.add_league_creator_as_member();

-- Users can always read their own membership rows
DROP POLICY IF EXISTS "Members: read own" ON public.league_members;
CREATE POLICY "Members: read own" ON public.league_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
