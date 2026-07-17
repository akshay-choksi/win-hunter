-- Friend-beta readiness checks (run in Supabase SQL editor or: supabase db query --linked -f ...)
-- Safe / read-only.

-- 1) Security objects present
SELECT 'join_league_by_invite' AS check, EXISTS (
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'join_league_by_invite'
) AS ok
UNION ALL
SELECT 'protect_profile_admin_flag', EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_profile_admin_flag'
)
UNION ALL
SELECT 'no_public_league_select', NOT EXISTS (
  SELECT 1 FROM pg_policy
  WHERE polrelid = 'public.leagues'::regclass
    AND polname = 'Leagues: any auth can lookup by invite'
);

-- 2) Operator admin
SELECT email, is_admin
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE p.is_admin;

-- 3) Draftable events (need prices)
SELECT name, status, start_date,
  (SELECT COUNT(*) FROM player_prices pp WHERE pp.tournament_id = t.id) AS prices
FROM tournaments t
WHERE status IN ('open', 'in_progress')
ORDER BY start_date;
