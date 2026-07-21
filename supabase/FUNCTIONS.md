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
5. During the event, members can use **Refresh live scores** from a lineup, or an admin can force **Sync Results**.
6. After the event, **Finalize Event** to award FedEx-style season points.

Member refreshes require league membership and are deduplicated by a two-minute
per-tournament cooldown in `result_sync_state`. One refresh updates every lineup
for the tournament; Supabase Realtime updates other open views.

**Performance:** fantasy points are computed in the Edge Function (DraftKings Classic
formula, same as SQL `compute_fantasy_points`) so sync avoids ~150 sequential RPCs.
DataGolf `/preds/in-play` (live position/score) and ESPN hole-by-hole scorecards
(hole tallies + bonuses) run in parallel. Place points recalculate from current
leaderboard position on every refresh.

## Scoring (DraftKings Classic Golf)

| Action | Points |
| ------ | ------ |
| Double eagle or better | +13 |
| Eagle | +8 |
| Birdie | +3 |
| Par | +0.5 |
| Bogey | −0.5 |
| Double bogey or worse | −1 |
| 1st / 2nd / 3rd (live place) | +30 / +20 / +18 |
| 4th–10th | +16 … +7 |
| 11–15 / 16–20 / 21–25 / 26–30 | +6 / +5 / +4 / +3 |
| 31–40 / 41–50 | +2 / +1 |
| 3-birdie streak (max 1/round) | +3 |
| Bogey-free round | +3 |
| Hole-in-one | +5 |
| All 4 rounds under 70 | +5 |

There is no flat made-cut bonus — making the cut matters because golfers play more holes.

League finish → FedEx points from `fedex_payout` × `tournaments.fedex_multiplier` (standard `1.0`, signature `1.5`, major `2.0`). Finalize writes `lineups.league_finish` + `lineups.season_points`, and increments `season_standings.wins` / `top5s` (1st = win; finishes 1–5 = top 5).

## Friend beta

Before inviting friends, apply the security migration and follow the full runbook in [`../FRIEND_BETA.md`](../FRIEND_BETA.md) (prod OAuth, deploy functions, Sync Odds, dry-run).
