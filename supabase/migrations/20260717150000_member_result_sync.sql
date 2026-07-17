-- Let league members request live result refreshes without exposing admin access.
-- A database claim provides a per-tournament cooldown and prevents concurrent
-- DataGolf calls from multiple users clicking refresh at once.

CREATE TABLE public.result_sync_state (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  last_started_at timestamptz NOT NULL DEFAULT now(),
  last_completed_at timestamptz,
  last_status text NOT NULL DEFAULT 'running'
    CHECK (last_status IN ('running', 'success', 'error')),
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.result_sync_state TO authenticated;
GRANT ALL ON public.result_sync_state TO service_role;
ALTER TABLE public.result_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Result sync state: auth read"
  ON public.result_sync_state
  FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_result_sync_state_updated
  BEFORE UPDATE ON public.result_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_result_sync(
  _tournament_id uuid,
  _cooldown_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed boolean := false;
BEGIN
  INSERT INTO public.result_sync_state (
    tournament_id,
    last_started_at,
    last_status,
    last_error
  )
  VALUES (_tournament_id, now(), 'running', NULL)
  ON CONFLICT (tournament_id) DO UPDATE
    SET last_started_at = now(),
        last_status = 'running',
        last_error = NULL
    WHERE result_sync_state.last_started_at
      <= now() - make_interval(secs => greatest(_cooldown_seconds, 0))
  RETURNING true INTO claimed;

  RETURN coalesce(claimed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_result_sync(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_result_sync(uuid, integer) TO service_role;
