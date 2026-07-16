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
  let pts = 0;
  if (input.madeCut) pts += SCORING.madeCut;
  pts += finishPoints(input.position, input.madeCut);
  pts += Math.max(input.birdies ?? 0, 0) * SCORING.birdie;
  pts += Math.max(input.eagles ?? 0, 0) * SCORING.eagle;
  if (input.totalToPar != null && input.totalToPar < 0) {
    pts += Math.abs(input.totalToPar) * SCORING.underParPerStroke;
  }
  return pts;
}

export function formatOdds(decimalOdds: number | null | undefined): string {
  if (decimalOdds == null || !Number.isFinite(decimalOdds)) return "—";
  return decimalOdds >= 10 ? decimalOdds.toFixed(1) : decimalOdds.toFixed(2);
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

export function isLineupLocked(tournament: Pick<Tournament, "lineup_lock_at" | "status">): boolean {
  if (tournament.status === "completed" || tournament.status === "in_progress") return true;
  if (!tournament.lineup_lock_at) return false;
  return Date.now() >= new Date(tournament.lineup_lock_at).getTime();
}
