import {
  adminClient,
  computeFantasyPoints,
  corsHeaders,
  dgFetch,
  jsonResponse,
  parsePosition,
  parseToPar,
  requireUser,
} from "../_shared/datagolf.ts";
import { fetchEspnHoleStatsMap, lookupHoleStats } from "../_shared/espn.ts";

type InPlayPlayer = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let tournamentId: string | null = null;

  try {
    const { userId } = await requireUser(req);
    const admin = adminClient();

    let leagueId: string | null = null;
    let force = false;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.tournament_id) tournamentId = String(body.tournament_id);
        if (body?.league_id) leagueId = String(body.league_id);
        force = body?.force === true;
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
      start_date: string | null;
    } | null = null;

    if (tournamentId) {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, dg_event_id, status, season_year, start_date")
        .eq("id", tournamentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    } else {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, dg_event_id, status, season_year, start_date")
        .in("status", ["open", "in_progress"])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    }

    if (!tournament) {
      return jsonResponse({
        message: "No open/in-progress tournament to sync.",
        resultsUpserted: 0,
      });
    }

    tournamentId = tournament.id;

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const isAdmin = profile?.is_admin === true;

    if (!isAdmin) {
      if (!leagueId) throw new Error("League required");
      if (tournament.status !== "in_progress") {
        return jsonResponse(
          { error: "Live score refresh is available while the event is in progress." },
          409,
        );
      }
      const { data: isMember, error: memberError } = await admin.rpc("is_league_member", {
        _league_id: leagueId,
        _user_id: userId,
      });
      if (memberError) throw new Error(memberError.message);
      if (!isMember) throw new Error("League members only");
    }

    if (
      tournament.status === "open" &&
      tournament.start_date &&
      new Date(`${tournament.start_date}T00:00:00Z`).getTime() > Date.now()
    ) {
      return jsonResponse({ error: `${tournament.name} has not started yet.` }, 409);
    }

    const cooldownSeconds = isAdmin && force ? 0 : 120;
    const { data: claimed, error: claimError } = await admin.rpc("claim_result_sync", {
      _tournament_id: tournament.id,
      _cooldown_seconds: cooldownSeconds,
    });
    if (claimError) throw new Error(claimError.message);

    if (!claimed) {
      const { data: state } = await admin
        .from("result_sync_state")
        .select("last_started_at, last_completed_at, last_status")
        .eq("tournament_id", tournament.id)
        .maybeSingle();
      const elapsedSeconds = state?.last_started_at
        ? Math.floor((Date.now() - new Date(state.last_started_at).getTime()) / 1000)
        : 0;
      return jsonResponse({
        message: "Scores were refreshed recently. Showing the latest available results.",
        tournamentId: tournament.id,
        cached: true,
        retryAfterSeconds: Math.max(120 - elapsedSeconds, 1),
        lastSyncedAt: state?.last_completed_at ?? state?.last_started_at ?? null,
      });
    }

    // In-play positions/scores from DataGolf; hole tallies from ESPN scorecards.
    const [inPlayRaw, holeStatsMap] = await Promise.all([
      dgFetch<unknown>("/preds/in-play", {
        tour: "pga",
        odds_format: "percent",
      }),
      fetchEspnHoleStatsMap(tournament.name),
    ]);

    const players = extractInPlayPlayers(inPlayRaw);
    if (players.length === 0) {
      await admin
        .from("result_sync_state")
        .update({
          last_completed_at: new Date().toISOString(),
          last_status: "success",
          last_error: null,
        })
        .eq("tournament_id", tournament.id);
      return jsonResponse({
        message: `No live in-play data for ${tournament.name}.`,
        tournamentId: tournament.id,
        resultsUpserted: 0,
      });
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

    const golferByDg = new Map(
      (golfers ?? []).map((g) => [g.dg_player_id as string, g.id as string]),
    );

    // Create any missing golfers in one batch instead of per-player round-trips.
    const missing = players.filter((p) => {
      const dgId = p.dg_id != null ? String(p.dg_id) : null;
      return !!dgId && !golferByDg.has(dgId);
    });
    if (missing.length > 0) {
      const rows = missing.map((p) => {
        const dgId = String(p.dg_id);
        return {
          dg_player_id: dgId,
          name: String(p.player_name ?? p.name ?? `Player ${dgId}`),
          is_active: true,
          salary: 0,
        };
      });
      const { data: created, error: createError } = await admin
        .from("golfers")
        .upsert(rows, { onConflict: "dg_player_id" })
        .select("id, dg_player_id");
      if (!createError && created) {
        for (const g of created) {
          if (g.dg_player_id) golferByDg.set(g.dg_player_id, g.id);
        }
      } else {
        // Partial unique index may block upsert — fall back to one lookup/insert each.
        for (const p of missing) {
          const dgId = String(p.dg_id);
          const name = String(p.player_name ?? p.name ?? `Player ${dgId}`);
          const { data: existing } = await admin
            .from("golfers")
            .select("id")
            .eq("dg_player_id", dgId)
            .maybeSingle();
          if (existing) {
            golferByDg.set(dgId, existing.id);
            continue;
          }
          const { data: inserted } = await admin
            .from("golfers")
            .insert({ dg_player_id: dgId, name, is_active: true, salary: 0 })
            .select("id")
            .single();
          if (inserted) golferByDg.set(dgId, inserted.id);
        }
      }
    }

    const resultRows: {
      tournament_id: string;
      golfer_id: string;
      position: number | null;
      made_cut: boolean;
      total_to_par: number | null;
      birdies: number;
      eagles: number;
      pars: number;
      bogeys: number;
      double_bogeys: number;
      double_eagles: number;
      bonus_points: number;
      rounds: unknown;
      fantasy_points: number;
      status: string | null;
    }[] = [];

    for (const p of players) {
      const dgId = p.dg_id != null ? String(p.dg_id) : null;
      if (!dgId) continue;
      const golferId = golferByDg.get(dgId);
      if (!golferId) continue;

      const statusRaw = String(p.status ?? p.player_status ?? "").toUpperCase();
      const pos = parsePosition(p.current_pos ?? p.position ?? p.pos);
      const toPar = parseToPar(p.current_score ?? p.total ?? p.score ?? p.to_par);
      const madeCut =
        statusRaw.includes("CUT") || statusRaw === "MC"
          ? false
          : pos != null || statusRaw.includes("F") || statusRaw === "ACTIVE" || toPar != null;

      const posText = String(p.current_pos ?? p.position ?? "").toUpperCase();
      const missedCut =
        posText === "CUT" || posText === "WD" || posText === "DQ" || statusRaw.includes("CUT");
      const finalMadeCut = missedCut ? false : madeCut;

      const playerName = String(p.player_name ?? p.name ?? "");
      const holes = lookupHoleStats(holeStatsMap, playerName);
      const rounds = {
        r1: p.R1 ?? p.r1 ?? null,
        r2: p.R2 ?? p.r2 ?? null,
        r3: p.R3 ?? p.r3 ?? null,
        r4: p.R4 ?? p.r4 ?? null,
        thru: p.thru ?? null,
        today: p.today ?? null,
      };

      // DK Classic — place points from live position so they rise/fall on refresh.
      const pts = computeFantasyPoints({
        position: missedCut ? null : pos,
        doubleEagles: holes.doubleEagles,
        eagles: holes.eagles,
        birdies: holes.birdies,
        pars: holes.pars,
        bogeys: holes.bogeys,
        doubleBogeys: holes.doubleBogeys,
        bonusPoints: holes.bonusPoints,
      });

      resultRows.push({
        tournament_id: tournament.id,
        golfer_id: golferId,
        position: missedCut ? null : pos,
        made_cut: finalMadeCut,
        total_to_par: toPar,
        birdies: holes.birdies,
        eagles: holes.eagles,
        pars: holes.pars,
        bogeys: holes.bogeys,
        double_bogeys: holes.doubleBogeys,
        double_eagles: holes.doubleEagles,
        bonus_points: holes.bonusPoints,
        rounds,
        fantasy_points: pts,
        status: missedCut ? posText || statusRaw || "CUT" : statusRaw || null,
      });
    }

    if (resultRows.length > 0) {
      const { error: upsertError } = await admin.from("player_results").upsert(resultRows, {
        onConflict: "tournament_id,golfer_id",
      });
      if (upsertError) throw new Error(upsertError.message);
    }

    // Roll up lineup totals from in-memory results (2 queries + parallel updates).
    const ptsByGolfer = new Map(resultRows.map((r) => [r.golfer_id, r.fantasy_points]));
    const { data: lineups, error: lineupsError } = await admin
      .from("lineups")
      .select("id")
      .eq("tournament_id", tournament.id);
    if (lineupsError) throw new Error(lineupsError.message);

    const lineupIds = (lineups ?? []).map((l) => l.id);
    const totals = new Map<string, number>(lineupIds.map((id) => [id, 0]));

    if (lineupIds.length > 0) {
      const { data: entries, error: entriesError } = await admin
        .from("lineup_entries")
        .select("lineup_id, golfer_id")
        .in("lineup_id", lineupIds);
      if (entriesError) throw new Error(entriesError.message);

      for (const e of entries ?? []) {
        totals.set(
          e.lineup_id,
          (totals.get(e.lineup_id) ?? 0) + (ptsByGolfer.get(e.golfer_id) ?? 0),
        );
      }

      await Promise.all(
        [...totals.entries()].map(([id, total]) =>
          admin.from("lineups").update({ total_points: total }).eq("id", id),
        ),
      );
    }

    const completedAt = new Date().toISOString();
    await admin
      .from("result_sync_state")
      .update({
        last_completed_at: completedAt,
        last_status: "success",
        last_error: null,
      })
      .eq("tournament_id", tournament.id);

    return jsonResponse({
      message: `Synced results for ${tournament.name}: ${resultRows.length} players, ${lineupIds.length} lineups.`,
      tournamentId: tournament.id,
      resultsUpserted: resultRows.length,
      lineupsUpdated: lineupIds.length,
      cached: false,
      lastSyncedAt: completedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "sync-results failed";
    if (tournamentId) {
      try {
        await adminClient()
          .from("result_sync_state")
          .update({ last_status: "error", last_error: message.slice(0, 500) })
          .eq("tournament_id", tournamentId);
      } catch {
        // Preserve the original sync failure.
      }
    }
    const status =
      message === "Unauthorized" ||
      message === "Admins only" ||
      message === "League required" ||
      message === "League members only"
        ? 403
        : 500;
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
