
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles: users read own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Profiles: users update own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles: users insert own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- LEAGUES
CREATE TABLE public.leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  salary_cap integer NOT NULL DEFAULT 50000,
  max_players integer NOT NULL DEFAULT 6,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;

-- LEAGUE MEMBERS
CREATE TABLE public.league_members (
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

-- Security definer helper (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_league_member(_league_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.league_members WHERE league_id = _league_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = _user_id), false);
$$;

-- Leagues policies
CREATE POLICY "Leagues: members can view" ON public.leagues FOR SELECT TO authenticated
  USING (public.is_league_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "Leagues: any auth can lookup by invite" ON public.leagues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Leagues: users create" ON public.leagues FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Leagues: creator updates" ON public.leagues FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Leagues: creator deletes" ON public.leagues FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- League members policies
CREATE POLICY "Members: view co-members" ON public.league_members FOR SELECT TO authenticated
  USING (public.is_league_member(league_id, auth.uid()));
CREATE POLICY "Members: join self" ON public.league_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members: leave self" ON public.league_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Extra profile policy: view co-members of shared leagues
CREATE POLICY "Profiles: view co-members" ON public.profiles FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.league_members lm1
    JOIN public.league_members lm2 ON lm1.league_id = lm2.league_id
    WHERE lm1.user_id = auth.uid() AND lm2.user_id = profiles.id
  )
);

-- GOLFERS
CREATE TABLE public.golfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  salary integer NOT NULL DEFAULT 0,
  tournament_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.golfers TO authenticated;
GRANT ALL ON public.golfers TO service_role;
ALTER TABLE public.golfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Golfers: auth read" ON public.golfers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Golfers: admin write" ON public.golfers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- LINEUPS
CREATE TABLE public.lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_spent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lineups TO authenticated;
GRANT ALL ON public.lineups TO service_role;
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lineups: view league lineups" ON public.lineups FOR SELECT TO authenticated
  USING (public.is_league_member(league_id, auth.uid()));
CREATE POLICY "Lineups: own insert" ON public.lineups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_league_member(league_id, auth.uid()));
CREATE POLICY "Lineups: own update" ON public.lineups FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Lineups: own delete" ON public.lineups FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- LINEUP ENTRIES
CREATE TABLE public.lineup_entries (
  lineup_id uuid NOT NULL REFERENCES public.lineups(id) ON DELETE CASCADE,
  golfer_id uuid NOT NULL REFERENCES public.golfers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lineup_id, golfer_id)
);
GRANT SELECT, INSERT, DELETE ON public.lineup_entries TO authenticated;
GRANT ALL ON public.lineup_entries TO service_role;
ALTER TABLE public.lineup_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entries: view via lineup" ON public.lineup_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lineups l WHERE l.id = lineup_id AND public.is_league_member(l.league_id, auth.uid())));
CREATE POLICY "Entries: own insert" ON public.lineup_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.lineups l WHERE l.id = lineup_id AND l.user_id = auth.uid()));
CREATE POLICY "Entries: own delete" ON public.lineup_entries FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lineups l WHERE l.id = lineup_id AND l.user_id = auth.uid()));

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_leagues_updated BEFORE UPDATE ON public.leagues FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_golfers_updated BEFORE UPDATE ON public.golfers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_lineups_updated BEFORE UPDATE ON public.lineups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime for lineups
ALTER PUBLICATION supabase_realtime ADD TABLE public.lineups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lineup_entries;
