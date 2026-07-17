# WinHunters

Salary-cap fantasy golf for friends: pick 6 golfers under a $50,000 cap, score live tournament fantasy points, and race for season standings with Signature (1.5×) and Major (2×) multipliers.

---

## Application preview

Polished sports-dashboard UI (green brand + navy emphasis panels) against the seeded Weekend Golfers league with mock tournament data.

Upload each asset in GitHub’s README editor, then paste the generated Markdown under the matching heading.

### Product flow

```
Auth → Home (leagues) → League (event + season boards)
                     ↘ Draft (salary-cap lineup)
                     ↘ Lineup viewer (live scoring breakdown)
Admin → Sync Odds → Sync Results → Finalize Event
```

### Dashboard — your leagues

League list with create / join, invite codes, and salary-cap badges.

<img width="1440" height="812" alt="Screenshot 2026-07-17 at 11 16 48 AM" src="https://github.com/user-attachments/assets/364823ad-5c49-434e-96b4-21cc2a0fe19f" />

### Event leaderboard

League home: live standings, event selector, season multipliers, and your points summary.

<img width="1383" height="755" alt="Screenshot 2026-07-17 at 11 17 06 AM" src="https://github.com/user-attachments/assets/cab6c527-fa73-48d4-bee6-095fc4e53002" />

### Live lineup scoring

Member lineup viewer: navy summary card, per-golfer breakdown, live fantasy points.

<img width="1440" height="827" alt="Screenshot 2026-07-17 at 11 17 17 AM" src="https://github.com/user-attachments/assets/30a8849f-ad09-4481-9b8b-b2d994c57759" />

### Walkthrough

https://github.com/user-attachments/assets/67b719d7-fa95-4521-9e5a-b84f4e0fc78a

---

## Stack

| Layer            | Choice                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| UI               | React 19, TypeScript, Vite, TanStack Start / Router                                                      |
| Components       | shadcn/ui (Radix), Tailwind CSS v4 design tokens (`primary` green, `navy`, `success`)                    |
| App chrome       | Sticky `AppHeader`, `PageHeader`, `StatCard`, `SurfacePanel`, `StatusBadge`                              |
| Backend          | [Supabase](https://supabase.com) (hosted Postgres + Auth + Edge Functions + Realtime)                    |
| Golf data        | [DataGolf](https://datagolf.com/) HTTP API (schedule, field, odds, in-play)                              |
| Hosting / editor | Connected to [Lovable](https://lovable.dev) (avoid force-pushing rewritten history on the synced branch) |

### TypeScript

The whole app is TypeScript end-to-end:

- **Client** — strict TS routes/components under `src/`
- **Generated types** — [`src/integrations/supabase/types.ts`](src/integrations/supabase/types.ts) mirrors the Postgres schema for typed Supabase queries
- **Scoring helpers** — [`src/lib/scoring.ts`](src/lib/scoring.ts) (fantasy breakdown, American odds, event multipliers)
- **Edge functions** — Deno TypeScript under [`supabase/functions/`](supabase/functions/)

### Supabase features used

| Feature                           | How WinHunters uses it                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Auth**                          | Google OAuth (and session cookies) for signed-in leagues                                                                  |
| **Postgres**                      | Leagues, members, tournaments, golfers, prices, lineups, results, season standings                                        |
| **Row Level Security (RLS)**      | Members see co-members’ data; lineup edits locked after tee; admin writes gated                                           |
| **Database functions / triggers** | `is_league_member`, `compute_fantasy_points`, lineup lock enforcement, creator auto-join                                  |
| **Realtime**                      | `postgres_changes` on `lineups`, `lineup_entries`, `player_results`, `season_standings` so boards refresh without polling |
| **Edge Functions**                | `sync-odds`, `sync-results`, `finalize-event` (service role + admin check)                                                |
| **Secrets**                       | `DATAGOLF_API_KEY` stored as an Edge Function secret (never in the Vite client)                                           |

### DataGolf API

Edge functions call DataGolf feeds (Scratch Plus key required), including:

- `/get-schedule` — PGA schedule + completed/upcoming status
- `/field-updates` — active field, tee times, OWGR, PGA `player_num` (for headshots)
- `/betting-tools/outrights` — win odds → salary curve
- `/preds/in-play` (+ optional live hole stats) — live positions / scores → fantasy points

Headshots use the PGA Tour Cloudinary CDN keyed by `player_num` (DataGolf does not serve images).

---

## Local setup

### Prerequisites

- **Node.js 22+**
- npm
- A Supabase project (this repo is typically linked to the hosted WinHunters project)
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) for migrations / function deploy
- Optional: DataGolf API key for odds/results sync

### 1. Install

```bash
cd win-hunter
npm install
```

### 2. Environment

Create `.env` (gitignored) with your Supabase project values:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_or_publishable_key
```

Optional local-only secrets in `.env.local`:

```bash
DATAGOLF_API_KEY=your_datagolf_key
```

Never commit `.env` / `.env.local`. See [`.gitignore`](.gitignore).

### 3. Auth redirect for localhost

In Supabase Dashboard → **Authentication → URL Configuration**, add redirect URLs:

- `http://localhost:8080/**`
- `http://localhost:8080/auth`

Otherwise Google sign-in may bounce to the Lovable Site URL. Details: [`LOCAL_DEV.md`](LOCAL_DEV.md).

### 4. Run the app

```bash
npm run dev
```

Open **[http://localhost:8080](http://localhost:8080)**.

### 5. Database & functions (admins)

```bash
# Apply migrations to the linked project
supabase db push

# Set DataGolf secret + deploy sync functions
supabase secrets set DATAGOLF_API_KEY=your_key_here
supabase functions deploy sync-odds
supabase functions deploy sync-results
supabase functions deploy finalize-event
```

More detail: [`supabase/FUNCTIONS.md`](supabase/FUNCTIONS.md).

### 6. Make yourself an admin

In the SQL editor (or CLI):

```sql
UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
-- or by email via auth.users join
```

Then open `/admin` → **Sync Tournament Odds**.

---

## How play works

1. **Create / join a league** (invite code, $50k / 6 golfers by default).
2. **Draft** a lineup before `lineup_lock_at` (first tee / Thursday). Over-budget adds are blocked.
3. **Event leaderboard** ranks lineup fantasy points and updates through Supabase Realtime.
4. **Lineup viewer** shows the live per-golfer breakdown and lets league members request a DataGolf refresh during an event.
5. **Finalize Event** awards season points from league finish × event multiplier (standard 1× / signature 1.5× / major 2×).

Fantasy scoring (round-based): made cut +10; finish bonuses; birdie +1; eagle +3; under-par +1 per stroke.

---

## Project map

```
src/
  routes/           # TanStack file routes (league, draft, lineup, admin, auth)
  components/       # App chrome + shadcn/ui + GolferAvatar
  styles.css        # Brand tokens (green / navy / success)
  lib/scoring.ts    # Fantasy math, odds, multipliers
  integrations/supabase/
supabase/
  migrations/       # Schema, RLS, triggers
  functions/        # sync-odds, sync-results, finalize-event
  FUNCTIONS.md      # Ops for DataGolf + deploys
docs/screenshots/   # README preview assets (optional local copies)
```

---

## Scripts

| Command           | Description                     |
| ----------------- | ------------------------------- |
| `npm run dev`     | Vite dev server (port **8080**) |
| `npm run build`   | Production build                |
| `npm run preview` | Preview production build        |
| `npm run lint`    | ESLint                          |
| `npm run format`  | Prettier                        |

---

## Notes

- **Hosting:** see [`HOSTING.md`](HOSTING.md) for Lovable Free-plan limits, production redirects, live refresh behavior, and Cloudflare deployment.
- **Friend beta:** follow [`FRIEND_BETA.md`](FRIEND_BETA.md) (OAuth allowlist, security migration, DataGolf ops, dry-run before invites).
- **Live results:** members can request a live DataGolf refresh from an in-progress lineup. A two-minute tournament cooldown deduplicates requests; Realtime updates every open view.
- **Sync performance win:** `sync-results` used to take ~16s on The Open because it issued one Postgres RPC per golfer (~156) plus sequential DataGolf calls. It now scores fantasy points in the Edge Function (mirroring SQL `compute_fantasy_points`), fetches DataGolf in-play + ESPN hole-by-hole birdie/eagle counts in parallel, and rolls up lineup totals from in-memory results — measured at ~2–3s for 156 players / 6 lineups on live Open data.
- **Demo seed:** [`supabase/seed_weekend_golfers_demo.sql`](supabase/seed_weekend_golfers_demo.sql) can populate a sample league for UI demos — **do not** re-run on shared prod during friend beta.
- Prefer not rewriting published git history on the Lovable-connected branch (no force-push / rebase of shared commits).
