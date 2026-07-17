# WinHunters — Odds & Scoring Setup

## DataGolf API key

1. Create a [DataGolf](https://datagolf.com/) account with **Scratch Plus** (needed for API access).
2. Copy your API key from the DataGolf API Access page.
3. Set it as a Supabase Edge Function secret (never put this in Vite/client env):

```bash
# From the project root, with Supabase CLI linked to this project
supabase secrets set DATAGOLF_API_KEY=your_key_here
```

Or in the Supabase Dashboard: **Project Settings → Edge Functions → Secrets** → add `DATAGOLF_API_KEY`.

## Deploy edge functions

```bash
supabase functions deploy sync-odds
supabase functions deploy sync-results
supabase functions deploy finalize-event
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

## Apply the database migration

```bash
supabase db push
```

Or run the SQL in `supabase/migrations/20260716182000_odds_pricing_fedex_scoring.sql` in the SQL editor.

## Admin workflow

1. Ensure your user has `profiles.is_admin = true`.
2. Open `/admin`.
3. **Sync Tournament Odds** — schedule + field + salaries for the active PGA event.
4. Members draft lineups before Thursday lock.
5. During the event, **Sync Results** to update fantasy points / event leaderboard.
6. After the event, **Finalize Event** to award FedEx-style season points.

## Scoring (round-based)

| Action | Points |
|--------|--------|
| Made cut | +10 |
| Finish 1 / 2 / 3 | +50 / +40 / +35 |
| Finish 4–5 / 6–10 / 11–20 / 21–30 | +28 / +20 / +12 / +8 |
| Made cut, outside top 30 | +4 |
| Birdie / Eagle | +1 / +3 each |
| Under par | +1 per stroke under |

League finish → FedEx points from `fedex_payout` × `tournaments.fedex_multiplier` (standard `1.0`, signature `1.5`, major `2.0`).

## Friend beta

Before inviting friends, apply the security migration and follow the full runbook in [`../FRIEND_BETA.md`](../FRIEND_BETA.md) (prod OAuth, deploy functions, Sync Odds, dry-run).
