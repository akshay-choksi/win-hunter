// Shared helpers for WinHunters edge functions (Deno)
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getAnonKey(): string {
  return (
    Deno.env.get("SUPABASE_ANON_KEY") ||
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    (() => {
      throw new Error("Missing env: SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
    })()
  );
}

export function adminClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const userClient = createClient(
    getEnv("SUPABASE_URL"),
    getAnonKey(),
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("Unauthorized");

  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.is_admin) throw new Error("Admins only");

  return { userId: authData.user.id };
}

export const DATAGOLF_BASE = "https://feeds.datagolf.com";

export async function dgFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const key = getEnv("DATAGOLF_API_KEY");
  const url = new URL(`${DATAGOLF_BASE}${path}`);
  url.searchParams.set("key", key);
  url.searchParams.set("file_format", "json");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && `${v}` !== "") {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataGolf ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Infer major / signature from event name (multipliers stay 1.0 until tuned). */
export function classifyEvent(name: string): "standard" | "signature" | "major" {
  const n = name.toLowerCase();
  if (
    n.includes("masters") ||
    n.includes("u.s. open") ||
    n.includes("us open") ||
    n.includes("open championship") ||
    n.includes("the open") ||
    n.includes("pga championship")
  ) {
    return "major";
  }
  if (n.includes("signature") || n.includes("players championship") || n.includes("the players")) {
    return "signature";
  }
  return "standard";
}

export function thursdayLockAt(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  // Treat start_date as event Thursday in US Eastern approx (14:00 UTC).
  const d = new Date(`${startDate}T14:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const BOOK_KEYS = [
  "bet365",
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "pointsbet",
  "betonline",
  "bovada",
  "pinnacle",
  "betfair",
  "unibet",
  "williamhill",
  "datagolf",
  "dg",
] as const;

export function extractDecimalOdds(row: Record<string, unknown>): number | null {
  const values: number[] = [];
  for (const key of BOOK_KEYS) {
    const raw = row[key];
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    if (Number.isFinite(n) && n > 1) values.push(n);
  }
  // Also scan numeric fields that look like odds
  if (values.length === 0) {
    for (const [k, v] of Object.entries(row)) {
      if (["dg_id", "player_name", "name", "rank"].includes(k)) continue;
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n > 1 && n < 10000) values.push(n);
    }
  }
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

export function oddsToSalaries(
  players: { dgId: string; decimalOdds: number }[],
  opts: { minSalary?: number; maxSalary?: number; step?: number } = {},
): Map<string, { salary: number; impliedProb: number; decimalOdds: number }> {
  const minSalary = opts.minSalary ?? 6000;
  const maxSalary = opts.maxSalary ?? 12500;
  const step = opts.step ?? 100;

  const impliedRaw = players.map((p) => ({
    dgId: p.dgId,
    decimalOdds: p.decimalOdds,
    implied: 1 / p.decimalOdds,
  }));
  const sum = impliedRaw.reduce((s, p) => s + p.implied, 0) || 1;
  const maxP = Math.max(...impliedRaw.map((p) => p.implied / sum), 1e-9);

  const out = new Map<string, { salary: number; impliedProb: number; decimalOdds: number }>();
  for (const p of impliedRaw) {
    const impliedProb = p.implied / sum;
    const ratio = Math.sqrt(impliedProb / maxP);
    let salary = minSalary + (maxSalary - minSalary) * ratio;
    salary = Math.round(salary / step) * step;
    salary = Math.min(maxSalary, Math.max(minSalary, salary));
    out.set(p.dgId, { salary, impliedProb, decimalOdds: p.decimalOdds });
  }
  return out;
}

export function parsePosition(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "CUT" || s === "WD" || s === "DQ" || s === "MDF" || s === "-") return null;
  const cleaned = s.replace(/^T/, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseToPar(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.trunc(raw);
  const s = String(raw).trim().toUpperCase();
  if (!s || s === "E" || s === "EVEN") return 0;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
