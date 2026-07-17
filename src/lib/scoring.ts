/** Round-based fantasy scoring constants (mirrors SQL compute_fantasy_points). */
export const SCORING = {
  madeCut: 10,
  birdie: 1,
  eagle: 3,
  underParPerStroke: 1,
} as const;

export function finishPoints(position: number | null, madeCut: boolean): number {
  if (position == null) return madeCut ? 4 : 0;
  if (position === 1) return 50;
  if (position === 2) return 40;
  if (position === 3) return 35;
  if (position >= 4 && position <= 5) return 28;
  if (position >= 6 && position <= 10) return 20;
  if (position >= 11 && position <= 20) return 12;
  if (position >= 21 && position <= 30) return 8;
  return madeCut ? 4 : 0;
}

export function computeFantasyPoints(input: {
  position: number | null;
  madeCut: boolean;
  totalToPar: number | null;
  birdies?: number;
  eagles?: number;
}): number {
  return breakdownFantasyPoints(input).total;
}

export type FantasyPointsBreakdown = {
  cut: number;
  finish: number;
  birdies: number;
  eagles: number;
  underPar: number;
  /** Birdie count (for display), not points */
  birdieCount: number;
  eagleCount: number;
  total: number;
};

/** Component breakdown matching compute_fantasy_points / SCORING. */
export function breakdownFantasyPoints(input: {
  position: number | null;
  madeCut: boolean;
  totalToPar: number | null;
  birdies?: number;
  eagles?: number;
}): FantasyPointsBreakdown {
  const birdieCount = Math.max(input.birdies ?? 0, 0);
  const eagleCount = Math.max(input.eagles ?? 0, 0);
  const cut = input.madeCut ? SCORING.madeCut : 0;
  const finish = finishPoints(input.position, input.madeCut);
  const birdies = birdieCount * SCORING.birdie;
  const eagles = eagleCount * SCORING.eagle;
  const underPar =
    input.totalToPar != null && input.totalToPar < 0
      ? Math.abs(input.totalToPar) * SCORING.underParPerStroke
      : 0;
  return {
    cut,
    finish,
    birdies,
    eagles,
    underPar,
    birdieCount,
    eagleCount,
    total: cut + finish + birdies + eagles + underPar,
  };
}

export function formatOdds(decimalOdds: number | null | undefined): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds)) return "—";
  return decimalOdds >= 10 ? decimalOdds.toFixed(1) : decimalOdds.toFixed(2);
}

/** Convert decimal odds (e.g. 6.0) to American integer (e.g. +500). */
export function decimalToAmerican(decimalOdds: number): number | null {
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return null;
  if (decimalOdds >= 2) return Math.round((decimalOdds - 1) * 100);
  return Math.round(-100 / (decimalOdds - 1));
}

/** Display American odds from stored decimal (`+500`, `-110`). */
export function formatAmericanOdds(decimalOdds: number | null | undefined): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds)) return "—";
  const american = decimalToAmerican(decimalOdds);
  if (american == null) return "—";
  return american > 0 ? `+${american}` : String(american);
}

/** PGA Tour Cloudinary headshot URL from field `player_num`. */
export function golferHeadshotUrl(pgaPlayerNum: string | null | undefined): string | null {
  if (!pgaPlayerNum) return null;
  const num = String(pgaPlayerNum).trim();
  if (!num || !/^\d+$/.test(num)) return null;
  return `https://pga-tour-res.cloudinary.com/image/upload/c_fill,g_face,w_80,h_80/headshots_${num}.png`;
}

export type TournamentStatus = "scheduled" | "open" | "in_progress" | "completed";
export type TournamentEventType = "standard" | "signature" | "major";

export type Tournament = {
  id: string;
  dg_event_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  season_year: number;
  event_type: TournamentEventType;
  fedex_multiplier: number;
  status: TournamentStatus;
  lineup_lock_at: string | null;
};

/** Infer major / signature from event name (mirrors edge classifyEvent). */
export function classifyEvent(name: string): TournamentEventType {
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

/** Season-point multiplier: standard 1×, signature 1.5×, major 2×. */
export function multiplierForEventType(eventType: TournamentEventType): number {
  if (eventType === "major") return 2;
  if (eventType === "signature") return 1.5;
  return 1;
}

/** Display label e.g. "Major · ×2 Season Pts". */
export function formatEventSeasonPtsLabel(
  tournament: Pick<Tournament, "event_type" | "fedex_multiplier">,
): string {
  const typeLabel =
    tournament.event_type === "major"
      ? "Major"
      : tournament.event_type === "signature"
        ? "Signature"
        : "Standard";
  const m = Number(tournament.fedex_multiplier ?? multiplierForEventType(tournament.event_type));
  const mLabel = Number.isInteger(m) ? String(m) : m.toFixed(1);
  return `${typeLabel} · ×${mLabel} Season Pts`;
}

export function isLineupLocked(tournament: Pick<Tournament, "lineup_lock_at" | "status">): boolean {
  if (tournament.status === "completed" || tournament.status === "in_progress") return true;
  if (!tournament.lineup_lock_at) return false;
  return Date.now() >= new Date(tournament.lineup_lock_at).getTime();
}

/** Closest event that is not completed (prefers in_progress / open, else nearest by start date). */
export function pickActiveTournament(
  list: Tournament[],
  nowMs: number = Date.now(),
): Tournament | null {
  if (!list.length) return null;

  const inProgress = list.find((t) => t.status === "in_progress");
  if (inProgress) return inProgress;
  const open = list.find((t) => t.status === "open");
  if (open) return open;

  const candidates = list.filter((t) => t.status !== "completed");
  if (!candidates.length) return null;

  const scored = candidates.map((t) => {
    const start = t.start_date
      ? new Date(`${t.start_date}T12:00:00.000Z`).getTime()
      : Number.POSITIVE_INFINITY;
    return { t, start, delta: start - nowMs };
  });

  scored.sort((a, b) => {
    // Prefer events that haven't finished their start week yet (delta >= -4 days)
    const aLive = a.delta >= -4 * 86400000;
    const bLive = b.delta >= -4 * 86400000;
    if (aLive !== bLive) return aLive ? -1 : 1;
    return Math.abs(a.delta) - Math.abs(b.delta);
  });

  return scored[0]?.t ?? null;
}
