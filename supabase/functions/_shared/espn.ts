/**
 * Live birdie/eagle counts from ESPN hole-by-hole scorecards.
 * DataGolf live-hole-stats is field-wide hole distributions, not per-player counts.
 */

type EspnHole = {
  scoreType?: { displayValue?: string };
};

type EspnRound = {
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

export type BirdieEagleCounts = { birdies: number; eagles: number };

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

function countFromCompetitor(comp: EspnCompetitor): BirdieEagleCounts {
  let birdies = 0;
  let eagles = 0;
  for (const round of comp.linescores ?? []) {
    for (const hole of round.linescores ?? []) {
      const rel = parseRelToPar(hole.scoreType?.displayValue);
      if (rel == null) continue;
      if (rel === -1) birdies += 1;
      else if (rel <= -2) eagles += 1;
    }
  }
  return { birdies, eagles };
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
    // Shared distinctive tokens (open, masters, players, …)
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
  // Prefer a named match; fall back to first event if nothing scored.
  if (bestScore <= 0) return events[0] ?? null;
  return best;
}

/**
 * Fetch ESPN PGA scoreboard and build name → birdie/eagle map for the matching event.
 * Best-effort: returns empty map on network/parse failure.
 */
export async function fetchEspnBirdieMap(
  tournamentName: string,
): Promise<Map<string, BirdieEagleCounts>> {
  const map = new Map<string, BirdieEagleCounts>();
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
      map.set(key, countFromCompetitor(comp));
    }
  } catch {
    // Live scoring still works without birdie/eagle detail.
  }
  return map;
}

/** Look up counts for a DataGolf-style player name. */
export function lookupBirdieCounts(
  map: Map<string, BirdieEagleCounts>,
  playerName: string,
): BirdieEagleCounts {
  const key = normalizePlayerName(playerName);
  return map.get(key) ?? { birdies: 0, eagles: 0 };
}
