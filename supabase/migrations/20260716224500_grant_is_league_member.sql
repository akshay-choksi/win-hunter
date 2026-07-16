-- RLS policies call is_league_member(); authenticated must be able to EXECUTE it.
-- (Earlier harden migration revoked EXECUTE from authenticated, breaking lineup insert/select.)
GRANT EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_league_member(uuid, uuid) FROM PUBLIC, anon;
