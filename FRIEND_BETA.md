# Friend beta launch checklist

Use this before inviting friends onto the shared Lovable + Supabase project.

## Hosting path

- **App:** Lovable published site (commits on `main` sync to Lovable).
- **Backend:** Hosted Supabase project `lkfdqzjoeigiwakhtsig`.
- You remain the only **admin** for Sync Odds / Sync Results / Finalize Event.

Do **not** re-run `supabase/seed_weekend_golfers_demo.sql` on the shared prod DB during beta.

## Status (automated)

| Step | Status |
|------|--------|
| Security migration applied (`friend_beta_security`) | Done |
| Admin nav gated + `join_league_by_invite` client | Done (ship with next push) |
| Edge functions redeployed (`sync-odds`, `sync-results`, `finalize-event`) | Done |
| `DATAGOLF_API_KEY` secret present | Done |
| Admin account (`akshayjchoksi@gmail.com`) | Done |
| Clean league **Friend Beta** created | Done — invite code **`5744P5`** |
| Live events with prices | The Open (in_progress), 3M Open (open) |
| Prod OAuth allowlist on Lovable URL | **You** — see §2 |
| Dry-run draft → Sync Results on a second account | **You** — see §4 |
| Invite friends with code only | **You** — share `5744P5` |

Verify anytime: [`supabase/friend_beta_verify.sql`](supabase/friend_beta_verify.sql)

---

## 1. Security (code + migration)

Already in repo:

- Migration [`supabase/migrations/20260717120000_friend_beta_security.sql`](supabase/migrations/20260717120000_friend_beta_security.sql)
  - Blocks client self-grant of `profiles.is_admin`
  - Drops public league listing; join via `join_league_by_invite`
- Admin nav only shows for admins

Applied to hosted Supabase via `supabase db push`.

If you ever need to re-grant admin (SQL editor as postgres only):

```sql
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'you@example.com';
```

---

## 2. Production OAuth (required — manual)

1. Publish / open the **Lovable production URL** (not only localhost).
2. Supabase → [Auth → URL Configuration](https://supabase.com/dashboard/project/lkfdqzjoeigiwakhtsig/auth/url-configuration):
   - **Redirect URLs** — add:
     - `https://YOUR-LOVABLE-HOST/**`
     - `https://YOUR-LOVABLE-HOST/auth`
     - Keep localhost entries for local dev (see [LOCAL_DEV.md](LOCAL_DEV.md)).
3. If Google sign-in fails with redirect/origin errors, open Google Cloud Console → OAuth client and allow the same origin / redirect URI.
4. Verify in an **incognito** window on a second device: open prod URL → Continue with Google → land on `/` leagues home.

App uses `redirectTo = ${window.location.origin}/auth` ([src/routes/auth.tsx](src/routes/auth.tsx)).

---

## 3. DataGolf + edge functions

See [supabase/FUNCTIONS.md](supabase/FUNCTIONS.md). Already deployed on this project; re-run only when function code changes:

```bash
supabase secrets set DATAGOLF_API_KEY=your_key_here   # if rotating
supabase functions deploy sync-odds
supabase functions deploy sync-results
supabase functions deploy finalize-event
```

As admin on production:

1. Open `/admin`.
2. **Sync Tournament Odds** if the next event has no prices (3M Open / The Open already have fields).
3. Confirm draft shows a priced field.

---

## 4. Friend dry-run

League ready: **Friend Beta** · invite code **`5744P5`**

1. Push this branch so Lovable picks up join-RPC + Admin nav gating.
2. Complete §2 OAuth on the Lovable URL.
3. Sign in as a **second** Google account, join with `5744P5`.
4. Both set lineups for **3M Open** (status `open`, unlocked) or view The Open after lock.
5. **Sync Results** once → check event leaderboard + lineup viewer.
6. Invite the rest of the group with **`5744P5` only** (codes are no longer browsable by all signed-in users).

### Operator runbook during the event

| When | Action |
|------|--------|
| Before Thursday lock | Sync Odds (if field/odds change) |
| During tournament | Sync Results periodically for live points |
| After event completes | Finalize Event for season points |

---

## 5. What friends need

- The Lovable URL
- A Google account
- Invite code **`5744P5`**

They do **not** need admin, DataGolf keys, or Supabase access.
