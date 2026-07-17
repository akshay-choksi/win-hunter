-- Friend-beta hardening:
-- 1) Prevent authenticated users from self-granting is_admin
-- 2) Stop listing all leagues/invite codes; join via exact-code RPC only

-- ---------------------------------------------------------------------------
-- profiles.is_admin lock
-- ---------------------------------------------------------------------------

-- Force is_admin=false on client inserts; block client updates to the flag.
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Clients must never create themselves as admin.
    IF auth.role() IN ('authenticated', 'anon') THEN
      NEW.is_admin := false;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF auth.role() IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Cannot modify is_admin via client';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_flag ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_flag
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flag();

-- Column-level: authenticated may update profile fields but not is_admin.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (full_name, avatar_url, updated_at) ON TABLE public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- leagues: drop public SELECT; join by invite code via SECURITY DEFINER RPC
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Leagues: any auth can lookup by invite" ON public.leagues;

CREATE OR REPLACE FUNCTION public.join_league_by_invite(_invite_code text)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lid uuid;
  lname text;
  code text := upper(trim(coalesce(_invite_code, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF code = '' THEN
    RAISE EXCEPTION 'Invite code required';
  END IF;

  SELECT l.id, l.name
  INTO lid, lname
  FROM public.leagues l
  WHERE upper(l.invite_code) = code;

  IF lid IS NULL THEN
    RAISE EXCEPTION 'No league with that invite code';
  END IF;

  INSERT INTO public.league_members (league_id, user_id)
  VALUES (lid, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT lid, lname;
END;
$$;

REVOKE ALL ON FUNCTION public.join_league_by_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_league_by_invite(text) TO authenticated, service_role;
