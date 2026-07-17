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

export async function requireUser(req: Request): Promise<{ userId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const userClient = createClient(getEnv("SUPABASE_URL"), getAnonKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) throw new Error("Unauthorized");

  return { userId: authData.user.id };
}

export async function requireAdmin(req: Request): Promise<{ userId: string }> {
  const { userId } = await requireUser(req);
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.is_admin) throw new Error("Admins only");

  return { userId };
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

/** Infer major / signature from event name. */
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
  // PGA Signature events rarely include the word "signature" in the title
  if (
    n.includes("signature") ||
    n.includes("players championship") ||
    n.includes("the players") ||
    n.includes("sentry") ||
    n.includes("pebble beach") ||
    n.includes("genesis invitational") ||
    n.includes("arnold palmer") ||
    n.includes("memorial") ||
    n.includes("rbc heritage") ||
    n.includes("travelers")
  ) {
    return "signature";
  }
  return "standard";
}

/** Season-point multiplier from event type: standard 1×, signature 1.5×, major 2×. */
export function multiplierForEventType(eventType: "standard" | "signature" | "major"): number {
  if (eventType === "major") return 2;
  if (eventType === "signature") return 1.5;
  return 1;
}

export function thursdayLockAt(startDate: string | null | undefined): string | null {
  if (!startDate) return null;
  // Treat start_date as event Thursday in US Eastern approx (14:00 UTC).
  const d = new Date(`${startDate}T14:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Parse a DataGolf tee time into an ISO timestamp; returns null if unparseable. */
export function parseTeeTime(raw: unknown, fallbackDate?: string | null): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Unix seconds or ms
    const ms = raw > 1e12 ? raw : raw * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  // Full ISO / datetime
  const direct = new Date(s);
  if (!Number.isNaN(direct.getTime()) && /[T\s-]/.test(s) && s.length >= 10) {
    return direct.toISOString();
  }

  // Time-only like "7:12" or "07:12 AM" — attach to event start date
  const timeMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (timeMatch && fallbackDate) {
    let hours = Number(timeMatch[1]);
    const mins = Number(timeMatch[2]);
    const ampm = timeMatch[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(
      `${fallbackDate}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00.000Z`,
    );
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
}

/**
 * Earliest tee time across field players → lineup lock.
 * Falls back to Thursday morning UTC from start_date when no tees present.
 */
export function earliestTeeLockAt(
  players: Record<string, unknown>[],
  startDate?: string | null,
): string | null {
  let earliest: number | null = null;
  for (const p of players) {
    const raw = p.tee_time ?? p.teetime ?? p.r1_tee_time ?? p.r1_teetime ?? p.teeTime;
    const iso = parseTeeTime(raw, startDate);
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isNaN(ms)) continue;
    if (earliest == null || ms < earliest) earliest = ms;
  }
  if (earliest != null) return new Date(earliest).toISOString();
  return thursdayLockAt(startDate);
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

/**
 * Local fantasy scoring — mirrors SQL `compute_fantasy_points`.
 * Keep in the Edge Function so sync-results does not pay for one RPC per golfer.
 */
export function computeFantasyPoints(input: {
  position: number | null;
  madeCut: boolean;
  totalToPar: number | null;
  birdies?: number;
  eagles?: number;
}): number {
  let pts = input.madeCut ? 10 : 0;

  if (input.position != null) {
    if (input.position === 1) pts += 50;
    else if (input.position === 2) pts += 40;
    else if (input.position === 3) pts += 35;
    else if (input.position >= 4 && input.position <= 5) pts += 28;
    else if (input.position >= 6 && input.position <= 10) pts += 20;
    else if (input.position >= 11 && input.position <= 20) pts += 12;
    else if (input.position >= 21 && input.position <= 30) pts += 8;
    else if (input.madeCut) pts += 4;
  } else if (input.madeCut) {
    pts += 4;
  }

  pts += Math.max(input.birdies ?? 0, 0);
  pts += Math.max(input.eagles ?? 0, 0) * 3;

  if (input.totalToPar != null && input.totalToPar < 0) {
    pts += Math.abs(input.totalToPar);
  }

  return pts;
}
