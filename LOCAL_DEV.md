# Run WinHunters locally

## One-time setup
1. Node 22+: `brew install node@22` (already done if you followed prior setup)
2. From repo root: `npm install`
3. Ensure `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Optional DataGolf key in `.env.local`: `DATAGOLF_API_KEY=...`

## Start the app
```bash
cd /Users/akshay/Documents/win-hunter
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run dev
```
Open http://localhost:8080/

## Fix Google login redirecting to Lovable
Not browser cache — Supabase Auth. When `redirectTo` is not allow-listed, Auth falls back to **Site URL** (your Lovable preview).

1. Open [Auth → URL Configuration](https://supabase.com/dashboard/project/lkfdqzjoeigiwakhtsig/auth/url-configuration)
2. Under **Redirect URLs**, add:
   - `http://localhost:8080/**`
   - `http://127.0.0.1:8080/**`
   - `http://localhost:8080/auth`
   - `http://127.0.0.1:8080/auth`
3. Save
4. Hard-refresh localhost, sign in again

Keep your Lovable preview URL(s) in the list too so preview login still works.

## Admin / sync odds
1. Sign in at http://localhost:8080/auth
2. Open http://localhost:8080/admin
3. Click **Sync Tournament Odds**
