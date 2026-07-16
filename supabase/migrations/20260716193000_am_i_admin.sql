-- Reliable admin self-check for the /admin page (bypasses profiles RLS quirks)
CREATE OR REPLACE FUNCTION public.am_i_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.am_i_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_admin() TO authenticated, service_role;
