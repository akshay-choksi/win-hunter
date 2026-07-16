import {
  adminClient,
  corsHeaders,
  dgFetch,
  jsonResponse,
  parsePosition,
  parseToPar,
  requireAdmin,
} from "../_shared/datagolf.ts";

type InPlayPlayer = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    await requireAdmin(req);
    const admin = adminClient();

    let tournamentId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.tournament_id) tournamentId = String(body.tournament_id);
      } catch {
        // no body
      }
    }

    // Resolve target tournament: explicit, else open/in_progress, else most recent open
    let tournament: {
      id: string;
      name: string;
      dg_event_id: string;
      status: string;
      season_year: number;
    } | null = null;

    if (tournamentId) {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, dg_event_id, status, season_year")
        .eq("id", tournamentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    } else {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, dg_event_id, status, season_year")
        .in("status", ["open", "in_progress"])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    }

    if (!tournament) {
      return jsonResponse({ message: "No open/in-progress tournament to sync.", resultsUpserted: 0 });
    }

    const inPlayRaw = await dgFetch<unknown>("/preds/in-play", {
      tour: "pga",
      odds_format: "percent",
    });

    const players = extractInPlayPlayers(inPlayRaw);
    if (players.length === 0) {
      return jsonResponse({
        message: `No live in-play data for ${tournament.name}.`,
        tournamentId: tournament.id,
        resultsUpserted: 0,
      });
    }

    // Optional birdie/eagle from live hole stats (best-effort)
    let birdieMap = new Map<string, { birdies: number; eagles: number }>();
    try {
      const holeRaw = await dgFetch<unknown>("/preds/live-hole-stats", { tour: "pga" });
      birdieMap = extractBirdieMap(holeRaw);
    } catch {
      // Scratch tier or off-week: scoring still works without birdies
    }

    // Mark in progress
    if (tournament.status === "open") {
      await admin.from("tournaments").update({ status: "in_progress" }).eq("id", tournament.id);
    }

    // Map dg_id -> golfer uuid
    const dgIds = players
      .map((p) => (p.dg_id != null ? String(p.dg_id) : null))
      .filter((id): id is string => !!id);

    const { data: golfers, error: golfersError } = await admin
      .from("golfers")
      .select("id, dg_player_id")
      .in("dg_player_id", dgIds);
    if (golfersError) throw new Error(golfersError.message);

    const golferByDg = new Map((golfers ?? []).map((g) => [g.dg_player_id as string, g.id as string]));

    const resultRows: {
      tournament_id: string;
      golfer_id: string;
      position: number | null;
      made_cut: boolean;
      total_to_par: number | null;
      birdies: number;
      eagles: number;
      rounds: unknown;
      fantasy_points: number;
      status: string | null;
    }[] = [];

    for (const p of players) {
      const dgId = p.dg_id != null ? String(p.dg_id) : null;
      if (!dgId) continue;
      let golferId = golferByDg.get(dgId);
      if (!golferId) {
        // Upsert missing golfer from live feed
        const name = String(p.player_name ?? p.name ?? `Player ${dgId}`);
        const { data: created, error } = await admin
          .from("golfers")
          .upsert(
            { dg_player_id: dgId, name, is_active: true, salary: 0 },
            { onConflict: "dg_player_id" },
          )
          .select("id")
          .single();
        // upsert onConflict needs unique constraint - we have partial unique index.
        // Fall back to insert/select if upsert fails.
        if (error || !created) {
          const { data: existing } = await admin
            .from("golfers")
            .select("id")
            .eq("dg_player_id", dgId)
            .maybeSingle();
          if (existing) {
            golferId = existing.id;
          } else {
            const { data: inserted } = await admin
              .from("golfers")
              .insert({ dg_player_id: dgId, name, is_active: true, salary: 0 })
              .select("id")
              .single();
            if (!inserted) continue;
            golferId = inserted.id;
          }
        } else {
          golferId = created.id;
        }
        golferByDg.set(dgId, golferId);
      }

      const statusRaw = String(p.status ?? p.player_status ?? "").toUpperCase();
      const pos = parsePosition(p.current_pos ?? p.position ?? p.pos);
      const toPar = parseToPar(p.current_score ?? p.total ?? p.score ?? p.to_par);
      const madeCut =
        statusRaw.includes("CUT") || statusRaw === "MC"
          ? false
          : pos != null || statusRaw.includes("F") || statusRaw === "ACTIVE" || toPar != null;

      // Infer missed cut from position text
      const posText = String(p.current_pos ?? p.position ?? "").toUpperCase();
      const missedCut = posText === "CUT" || posText === "WD" || posText === "DQ" || statusRaw.includes("CUT");
      const finalMadeCut = missedCut ? false : madeCut;

      const counts = birdieMap.get(dgId) ?? { birdies: 0, eagles: 0 };
      const rounds = {
        r1: p.R1 ?? p.r1 ?? null,
        r2: p.R2 ?? p.r2 ?? null,
        r3: p.R3 ?? p.r3 ?? null,
        r4: p.R4 ?? p.r4 ?? null,
        thru: p.thru ?? null,
        today: p.today ?? null,
      };

      const { data: pts, error: ptsError } = await admin.rpc("compute_fantasy_points", {
        _position: missedCut ? null : pos,
        _made_cut: finalMadeCut,
        _total_to_par: toPar,
        _birdies: counts.birdies,
        _eagles: counts.eagles,
      });
      if (ptsError) throw new Error(ptsError.message);

      resultRows.push({
        tournament_id: tournament.id,
        golfer_id: golferId,
        position: missedCut ? null : pos,
        made_cut: finalMadeCut,
        total_to_par: toPar,
        birdies: counts.birdies,
        eagles: counts.eagles,
        rounds,
        fantasy_points: Number(pts ?? 0),
        status: missedCut ? posText || statusRaw || "CUT" : statusRaw || null,
      });
    }

    if (resultRows.length > 0) {
      const { error: upsertError } = await admin.from("player_results").upsert(resultRows, {
        onConflict: "tournament_id,golfer_id",
      });
      if (upsertError) throw new Error(upsertError.message);
    }

    // Roll up lineup totals for this tournament
    const { data: lineups, error: lineupsError } = await admin
      .from("lineups")
      .select("id")
      .eq("tournament_id", tournament.id);
    if (lineupsError) throw new Error(lineupsError.message);

    let lineupsUpdated = 0;
    for (const lineup of lineups ?? []) {
      const { data: entries } = await admin
        .from("lineup_entries")
        .select("golfer_id")
        .eq("lineup_id", lineup.id);
      const golferIds = (entries ?? []).map((e) => e.golfer_id);
      if (golferIds.length === 0) {
        await admin.from("lineups").update({ total_points: 0 }).eq("id", lineup.id);
        continue;
      }
      const { data: results } = await admin
        .from("player_results")
        .select("fantasy_points")
        .eq("tournament_id", tournament.id)
        .in("golfer_id", golferIds);
      const total = (results ?? []).reduce((s, r) => s + Number(r.fantasy_points ?? 0), 0);
      await admin.from("lineups").update({ total_points: total }).eq("id", lineup.id);
      lineupsUpdated += 1;
    }

    return jsonResponse({
      message: `Synced results for ${tournament.name}: ${resultRows.length} players, ${lineupsUpdated} lineups.`,
      tournamentId: tournament.id,
      resultsUpserted: resultRows.length,
      lineupsUpdated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync-results failed";
    const status = message === "Unauthorized" || message === "Admins only" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});

function extractInPlayPlayers(raw: unknown): InPlayPlayer[] {
  if (Array.isArray(raw)) return raw as InPlayPlayer[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "players", "live_stats", "field"]) {
      if (Array.isArray(obj[key])) return obj[key] as InPlayPlayer[];
    }
  }
  return [];
}

function extractBirdieMap(raw: unknown): Map<string, { birdies: number; eagles: number }> {
  const map = new Map<string, { birdies: number; eagles: number }>();
  const rows: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) rows.push(...(raw as Record<string, unknown>[]));
  else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["data", "players", "stats"]) {
      if (Array.isArray(obj[key])) rows.push(...(obj[key] as Record<string, unknown>[]));
    }
  }
  for (const row of rows) {
    const dgId = row.dg_id != null ? String(row.dg_id) : null;
    if (!dgId) continue;
    const birdies = Number(row.birdies ?? row.birdie ?? 0) || 0;
    const eagles = Number(row.eagles ?? row.eagle ?? 0) || 0;
    if (birdies || eagles) map.set(dgId, { birdies, eagles });
  }
  return map;
}
