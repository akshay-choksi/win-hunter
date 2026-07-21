import { adminClient, corsHeaders, jsonResponse, requireAdmin } from "../_shared/datagolf.ts";

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

    let tournament: {
      id: string;
      name: string;
      season_year: number;
      fedex_multiplier: number;
      status: string;
    } | null = null;

    if (tournamentId) {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, season_year, fedex_multiplier, status")
        .eq("id", tournamentId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    } else {
      const { data, error } = await admin
        .from("tournaments")
        .select("id, name, season_year, fedex_multiplier, status")
        .in("status", ["in_progress", "open"])
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      tournament = data;
    }

    if (!tournament) {
      return jsonResponse({ message: "No tournament to finalize.", awards: 0 });
    }

    if (tournament.status === "completed") {
      return jsonResponse({
        message: `${tournament.name} is already finalized.`,
        tournamentId: tournament.id,
        awards: 0,
      });
    }

    const { data: payouts, error: payoutError } = await admin
      .from("fedex_payout")
      .select("finish_position, points")
      .order("finish_position", { ascending: true });
    if (payoutError) throw new Error(payoutError.message);

    const payoutByFinish = new Map(
      (payouts ?? []).map((p) => [p.finish_position as number, Number(p.points)]),
    );
    const multiplier = Number(tournament.fedex_multiplier ?? 1);

    const { data: lineups, error: lineupsError } = await admin
      .from("lineups")
      .select("id, league_id, user_id, total_points, league_finish, season_points")
      .eq("tournament_id", tournament.id);
    if (lineupsError) throw new Error(lineupsError.message);

    if (!lineups || lineups.length === 0) {
      await admin.from("tournaments").update({ status: "completed" }).eq("id", tournament.id);
      return jsonResponse({
        message: `${tournament.name} marked completed (no lineups).`,
        awards: 0,
      });
    }

    // Skip lineups already awarded (double-finalize guard).
    const pending = lineups.filter((l) => l.league_finish == null);
    if (pending.length === 0) {
      await admin.from("tournaments").update({ status: "completed" }).eq("id", tournament.id);
      return jsonResponse({
        message: `${tournament.name} already has season awards on all lineups.`,
        tournamentId: tournament.id,
        awards: 0,
      });
    }

    const byLeague = new Map<string, typeof pending>();
    for (const l of pending) {
      const arr = byLeague.get(l.league_id) ?? [];
      arr.push(l);
      byLeague.set(l.league_id, arr);
    }

    let awards = 0;
    const awardSummary: { league_id: string; user_id: string; finish: number; fedex: number }[] =
      [];

    for (const [leagueId, leagueLineups] of byLeague) {
      // Rank against all league lineups for this event so ties match full board.
      const allForLeague = lineups.filter((l) => l.league_id === leagueId);
      const sorted = [...allForLeague].sort(
        (a, b) => Number(b.total_points) - Number(a.total_points),
      );

      let finish = 0;
      let lastPoints: number | null = null;
      let index = 0;
      const finishById = new Map<string, number>();
      for (const row of sorted) {
        index += 1;
        const pts = Number(row.total_points);
        if (lastPoints === null || pts !== lastPoints) {
          finish = index;
          lastPoints = pts;
        }
        finishById.set(row.id, finish);
      }

      for (const row of leagueLineups) {
        const place = finishById.get(row.id) ?? 0;
        const base = payoutByFinish.get(place) ?? 0;
        const fedex = base * multiplier;
        const isWin = place === 1;
        const isTop5 = place >= 1 && place <= 5;

        const { error: lineupError } = await admin
          .from("lineups")
          .update({
            league_finish: place,
            season_points: fedex,
          })
          .eq("id", row.id)
          .is("league_finish", null);
        if (lineupError) throw new Error(lineupError.message);

        const { data: existing } = await admin
          .from("season_standings")
          .select("fedex_points, events_played, wins, top5s")
          .eq("league_id", leagueId)
          .eq("user_id", row.user_id)
          .eq("season_year", tournament.season_year)
          .maybeSingle();

        if (existing) {
          const { error } = await admin
            .from("season_standings")
            .update({
              fedex_points: Number(existing.fedex_points) + fedex,
              events_played: Number(existing.events_played) + 1,
              wins: Number(existing.wins ?? 0) + (isWin ? 1 : 0),
              top5s: Number(existing.top5s ?? 0) + (isTop5 ? 1 : 0),
            })
            .eq("league_id", leagueId)
            .eq("user_id", row.user_id)
            .eq("season_year", tournament.season_year);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await admin.from("season_standings").insert({
            league_id: leagueId,
            user_id: row.user_id,
            season_year: tournament.season_year,
            fedex_points: fedex,
            events_played: 1,
            wins: isWin ? 1 : 0,
            top5s: isTop5 ? 1 : 0,
          });
          if (error) throw new Error(error.message);
        }

        awards += 1;
        awardSummary.push({
          league_id: leagueId,
          user_id: row.user_id,
          finish: place,
          fedex,
        });
      }
    }

    await admin.from("tournaments").update({ status: "completed" }).eq("id", tournament.id);

    return jsonResponse({
      message: `Finalized ${tournament.name}: awarded FedEx points to ${awards} lineup(s).`,
      tournamentId: tournament.id,
      awards,
      awardSummary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "finalize-event failed";
    const status = message === "Unauthorized" || message === "Admins only" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
