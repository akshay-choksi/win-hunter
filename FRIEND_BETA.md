# Friend beta launch checklist

Use this before inviting friends onto the shared Lovable + Supabase project.

## Hosting path

- **App:** Lovable published site (commits on `main` sync to Lovable).
- **Backend:** Hosted Supabase project `lkfdqzjoeigiwakhtsig`.
- You remain the only **admin** for Sync Odds / Finalize Event. Members can request throttled live result refreshes.

Do **not** re-run `supabase/seed_weekend_golfers_demo.sql` or `supabase/seed_3m_open_draft_demo.sql` on the shared prod DB during beta.

## Status

| Step | Status |
| ---- | ------ |
| Security migration (`friend_beta_security`) | Done |
| Admin nav gated + `join_league_by_invite` | Done (on `main`) |
| Edge functions + `DATAGOLF_API_KEY` | Done |
| DK Classic / ESPN live scoring | Done |
| League **Friend Beta** · invite **`5744P5`** | Done |
| Admin account (`akshayjchoksi@gmail.com`) | Done |
| The Open closed for beta focus | Done — status `completed` (history kept) |
| 3M Open demo prices wiped | Done — `scheduled`, **0 prices** |
| Live Sync Odds for 3M | **Blocked until DataGolf field flips to 3M** (still The Open R2 as of reset) |
| Prod OAuth allowlist on Lovable URL | **You** — §2 |
| Dry-run second Google account | **You** — §4 |
| Invite friends | **You** — §5 |

Verify: [`supabase/friend_beta_verify.sql`](supabase/friend_beta_verify.sql)

Reset scripts (already applied once on prod):

- [`supabase/reset_3m_for_live_odds.sql`](supabase/reset_3m_for_live_odds.sql)
- [`supabase/close_open_without_finalize.sql`](supabase/close_open_without_finalize.sql)

---

## 1. Security (code + migration)

Already applied. Re-grant admin only via SQL editor as postgres:

```sql
UPDATE public.profiles p
SET is_admin = true
FROM auth.users u
WHERE p.id = u.id AND u.email = 'you@example.com';
```

---

## 2. Production OAuth (required — manual)

1. In Lovable, **Publish** and copy the production URL (e.g. `https://….lovable.app`).
2. Supabase → [Auth → URL Configuration](https://supabase.com/dashboard/project/lkfdqzjoeigiwakhtsig/auth/url-configuration):
   - **Site URL** — set to the Lovable production URL (or keep preview and add redirects).
   - **Redirect URLs** — add:
     - `https://YOUR-LOVABLE-HOST/**`
     - `https://YOUR-LOVABLE-HOST/auth`
     - Keep localhost entries for local dev ([LOCAL_DEV.md](LOCAL_DEV.md)).
3. Google Cloud Console → OAuth client → allow the same origin / redirect URI.
4. Incognito on a second device: prod URL → Continue with Google → land on `/`.

App uses `redirectTo = ${window.location.origin}/auth` ([src/routes/auth.tsx](src/routes/auth.tsx)).

---

## 3. 3M Open live odds (operator)

Cloned Open prices were cleared. DataGolf’s **current** field is still The Open until that event ends / DG flips.

When `field-updates` shows **3M Open**:

1. `/admin` → **Sync Tournament Odds** (prices whatever event DG has live — do **not** sync while Open is still current if you only want 3M).
2. Confirm 3M is `open`, has salaries/odds, lock time looks right.
3. Spot-check draft favorites.

Re-run wipe anytime:

```bash
supabase db query --linked -f supabase/reset_3m_for_live_odds.sql --yes
```

### Operator runbook

| When | Action |
| ---- | ------ |
| DG field = 3M | Sync Odds |
| Before Thursday lock | Sync Odds again if field/odds move |
| During tournament | Members Refresh live scores; admin can force Sync Results |
| After event | Finalize Event for season points |

---

## 4. Friend dry-run

1. Complete §2 OAuth on the Lovable URL.
2. Second Google account → join with **`5744P5`** → confirm **Admin** is hidden.
3. After Sync Odds for 3M: both set lineups for **3M Open**.
4. (Optional) View completed Open lineups for history.

---

## 5. What to send friends

Copy/paste:

```
WinHunters fantasy golf — Friend Beta

1. Open: <PASTE_LOVABLE_URL>
2. Sign in with Google
3. Join league with invite code: 5744P5
4. Set your lineup for the 3M Open before lock (Thursday tee / app lock time)

Questions → reply here. Don’t share the invite code publicly.
```

They need: Lovable URL + Google + **`5744P5`**.  
They do **not** need admin, DataGolf, or Supabase.
