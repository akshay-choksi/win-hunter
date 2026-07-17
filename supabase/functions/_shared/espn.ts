/**
 * Live per-player hole stats from ESPN hole-by-hole scorecards.
 * Used for DraftKings Classic-style fantasy scoring.
 */

type EspnHole = {
  value?: number;
  displayValue?: string;
  scoreType?: { displayValue?: string };
};

type EspnRound = {
  value?: number;
  displayValue?: string;
  linescores?: EspnHole[];
};

type EspnCompetitor = {
  athlete?: { displayName?: string };
  linescores?: EspnRound[];
};

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  competitions?: { competitors?: EspnCompetitor[] }[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
};

/** Per-player hole tallies + DK bonus points derived from ESPN scorecards. */
export type DkHoleStats = {
  doubleEagles: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  /** Streak / bogey-free / HIO / all-4-under-70 bonus points. */
  bonusPoints: number;
};

const EMPTY_STATS: DkHoleStats = {
  doubleEagles: 0,
  eagles: 0,
  birdies: 0,
  pars: 0,
  bogeys: 0,
  doubleBogeys: 0,
  bonusPoints: 0,
};

/** Fold accents / Nordic letters and normalize "Last, First" → "first last". */
export function normalizePlayerName(name: string): string {
  let raw = name.trim();
  if (raw.includes(",")) {
    const [last, first] = raw.split(",", 2).map((p) => p.trim());
    if (first) raw = `${first} ${last}`;
  }

  let s = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s
    .replace(/[øØ]/g, "o")
    .replace(/[æÆ]/g, "ae")
    .replace(/[åÅ]/g, "a")
    .replace(/[łŁ]/g, "l")
    .replace(/[ß]/g, "ss");
  s = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

function parseRelToPar(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  if (!s) return null;
  if (s === "E" || s === "EVEN") return 0;
  const n = Number(s.replace("+", ""));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function hasBirdieOrBetterStreak(rels: number[]): boolean {
  let streak = 0;
  for (const rel of rels) {
    if (rel <= -1) {
      streak += 1;
      if (streak >= 3) return true;
    } else {
      streak = 0;
    }
  }
  return false;
}

function statsFromCompetitor(comp: EspnCompetitor): DkHoleStats {
  let doubleEagles = 0;
  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doubleBogeys = 0;
  let holeInOnes = 0;
  let birdieStreakBonuses = 0;
  let bogeyFreeRounds = 0;
  const completedRoundStrokes: number[] = [];

  for (const round of comp.linescores ?? []) {
    const holes = round.linescores ?? [];
    const rels: number[] = [];
    let roundBogeys = 0;

    for (const hole of holes) {
      const rel = parseRelToPar(hole.scoreType?.displayValue);
      if (rel == null) continue;
      rels.push(rel);

      if (rel <= -3) doubleEagles += 1;
      else if (rel === -2) eagles += 1;
      else if (rel === -1) birdies += 1;
      else if (rel === 0) pars += 1;
      else if (rel === 1) {
        bogeys += 1;
        roundBogeys += 1;
      } else {
        doubleBogeys += 1;
        roundBogeys += 1;
      }

      const strokes = typeof hole.value === "number" ? hole.value : Number(hole.displayValue);
      if (Number.isFinite(strokes) && strokes === 1) holeInOnes += 1;
    }

    if (rels.length === 18) {
      if (hasBirdieOrBetterStreak(rels)) birdieStreakBonuses += 1;
      if (roundBogeys === 0) bogeyFreeRounds += 1;

      const roundStrokes =
        typeof round.value === "number" && Number.isFinite(round.value)
          ? round.value
          : Number(round.displayValue);
      if (Number.isFinite(roundStrokes) && roundStrokes > 0) {
        completedRoundStrokes.push(roundStrokes);
      }
    } else if (rels.length > 0 && hasBirdieOrBetterStreak(rels)) {
      // Mid-round streak still counts once the third birdie-or-better lands.
      birdieStreakBonuses += 1;
    }
  }

  const allFourUnder70 =
    completedRoundStrokes.length >= 4 &&
    completedRoundStrokes.slice(0, 4).every((s) => s < 70);

  const bonusPoints =
    birdieStreakBonuses * 3 +
    bogeyFreeRounds * 3 +
    holeInOnes * 5 +
    (allFourUnder70 ? 5 : 0);

  return {
    doubleEagles,
    eagles,
    birdies,
    pars,
    bogeys,
    doubleBogeys,
    bonusPoints,
  };
}

function eventMatchScore(event: EspnEvent, tournamentName: string): number {
  const target = normalizePlayerName(tournamentName);
  const candidates = [event.name, event.shortName]
    .filter(Boolean)
    .map((n) => normalizePlayerName(String(n)));
  let best = 0;
  for (const c of candidates) {
    if (c === target) return 100;
    if (c.includes(target) || target.includes(c)) best = Math.max(best, 80);
    const tParts = new Set(target.split(" ").filter((w) => w.length > 2));
    const cParts = new Set(c.split(" ").filter((w) => w.length > 2));
    let overlap = 0;
    for (const w of tParts) if (cParts.has(w)) overlap += 1;
    best = Math.max(best, overlap * 15);
  }
  return best;
}

function pickEvent(events: EspnEvent[], tournamentName: string): EspnEvent | null {
  if (!events.length) return null;
  let best: EspnEvent | null = null;
  let bestScore = -1;
  for (const ev of events) {
    const score = eventMatchScore(ev, tournamentName);
    if (score > bestScore) {
      bestScore = score;
      best = ev;
    }
  }
  if (bestScore <= 0) return events[0] ?? null;
  return best;
}

/**
 * Fetch ESPN PGA scoreboard and build name → DK hole stats for the matching event.
 * Best-effort: returns empty map on network/parse failure.
 */
export async function fetchEspnHoleStatsMap(
  tournamentName: string,
): Promise<Map<string, DkHoleStats>> {
  const map = new Map<string, DkHoleStats>();
  try {
    const res = await fetch(
      "https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard",
      {
        headers: { "User-Agent": "WinHunters/1.0" },
      },
    );
    if (!res.ok) return map;
    const data = (await res.json()) as EspnScoreboard;
    const event = pickEvent(data.events ?? [], tournamentName);
    const competitors = event?.competitions?.[0]?.competitors ?? [];
    for (const comp of competitors) {
      const display = comp.athlete?.displayName;
      if (!display) continue;
      const key = normalizePlayerName(display);
      if (!key) continue;
      map.set(key, statsFromCompetitor(comp));
    }
  } catch {
    // Live scoring still works without hole-by-hole detail.
  }
  return map;
}

/** Look up hole stats for a DataGolf-style player name. */
export function lookupHoleStats(
  map: Map<string, DkHoleStats>,
  playerName: string,
): DkHoleStats {
  const key = normalizePlayerName(playerName);
  return map.get(key) ?? { ...EMPTY_STATS };
}

/** @deprecated Use fetchEspnHoleStatsMap */
export async function fetchEspnBirdieMap(tournamentName: string) {
  return fetchEspnHoleStatsMap(tournamentName);
}

/** @deprecated Use lookupHoleStats */
export function lookupBirdieCounts(map: Map<string, DkHoleStats>, playerName: string) {
  const s = lookupHoleStats(map, playerName);
  return { birdies: s.birdies, eagles: s.eagles + s.doubleEagles };
}
