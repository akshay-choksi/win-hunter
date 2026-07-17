import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Lock } from "lucide-react";
import { GolferAvatar } from "@/components/golfer-avatar";
import {
  breakdownFantasyPoints,
  formatAmericanOdds,
  isLineupLocked,
  pickActiveTournament,
  type Tournament,
} from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/league/$id_/lineup/$userId")({
  validateSearch: (search: Record<string, unknown>) => ({
    tournament: typeof search.tournament === "string" ? search.tournament : undefined,
  }),
  component: LineupViewerPage,
});

type GolferRow = {
  golfer_id: string;
  name: string;
  salary: number;
  decimal_odds: number | null;
  pga_player_num: string | null;
  owgr_rank: number | null;
  position: number | null;
  total_to_par: number | null;
  fantasy_points: number;
  made_cut: boolean;
  status: string | null;
  birdies: number;
  eagles: number;
};

function formatToPar(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

function formatPos(pos: number | null, status: string | null): string {
  if (status && /cut|wd|dq/i.test(status)) return status.toUpperCase();
  if (pos == null) return "—";
  return `T${pos}`;
}

function formatOwgr(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "OWGR —";
  return `OWGR ${rank}`;
}

function LineupViewerPage() {
  const { id: leagueId, userId } = Route.useParams();
  const { tournament: tournamentQuery } = Route.useSearch();
  const { user } = useAuth();

  const [leagueName, setLeagueName] = useState("");
  const [ownerName, setOwnerName] = useState("Player");
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rows, setRows] = useState<GolferRow[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [lineupTotal, setLineupTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const isOwn = user?.id === userId;
  const locked = tournament ? isLineupLocked(tournament) : false;

  async function load() {
    setLoading(true);
    setForbidden(false);

    const { data: league } = await supabase
      .from("leagues")
      .select("name")
      .eq("id", leagueId)
      .maybeSingle();
    setLeagueName(league?.name ?? "League");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    setOwnerName(profile?.full_name ?? "Player");

    let active: Tournament | null = null;
    if (tournamentQuery) {
      const { data } = await supabase
        .from("tournaments")
        .select(
          "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at",
        )
        .eq("id", tournamentQuery)
        .maybeSingle();
      active = (data as Tournament | null) ?? null;
    } else {
      const { data: tournaments } = await supabase
        .from("tournaments")
        .select(
          "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at",
        )
        .in("status", ["open", "in_progress", "completed", "scheduled"])
        .order("start_date", { ascending: false })
        .limit(40);
      const list = (tournaments ?? []) as Tournament[];
      active =
        (tournamentQuery ? list.find((t) => t.id === tournamentQuery) : null) ??
        pickActiveTournament(list);
    }
    setTournament(active);

    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }

    const viewingOthers = user?.id !== userId;
    if (viewingOthers && !isLineupLocked(active)) {
      setForbidden(true);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: lineup } = await supabase
      .from("lineups")
      .select("id, total_spent, total_points")
      .eq("league_id", leagueId)
      .eq("user_id", userId)
      .eq("tournament_id", active.id)
      .maybeSingle();

    if (!lineup) {
      setRows([]);
      setTotalSpent(0);
      setLineupTotal(0);
      setLoading(false);
      return;
    }

    setTotalSpent(lineup.total_spent);
    setLineupTotal(Number(lineup.total_points ?? 0));

    const { data: entries } = await supabase
      .from("lineup_entries")
      .select("golfer_id, golfers(id, name, pga_player_num, owgr_rank)")
      .eq("lineup_id", lineup.id);

    const golferIds = (entries ?? []).map((e) => e.golfer_id);

    const [{ data: prices }, { data: results }] = await Promise.all([
      golferIds.length
        ? supabase
            .from("player_prices")
            .select("golfer_id, salary, decimal_odds")
            .eq("tournament_id", active.id)
            .in("golfer_id", golferIds)
        : Promise.resolve({ data: [] as { golfer_id: string; salary: number; decimal_odds: number | null }[] }),
      golferIds.length
        ? supabase
            .from("player_results")
            .select("golfer_id, position, total_to_par, fantasy_points, made_cut, status, birdies, eagles")
            .eq("tournament_id", active.id)
            .in("golfer_id", golferIds)
        : Promise.resolve({
            data: [] as {
              golfer_id: string;
              position: number | null;
              total_to_par: number | null;
              fantasy_points: number;
              made_cut: boolean;
              status: string | null;
              birdies: number;
              eagles: number;
            }[],
          }),
    ]);

    const priceById = new Map((prices ?? []).map((p) => [p.golfer_id, p]));
    const resultById = new Map((results ?? []).map((r) => [r.golfer_id, r]));

    const next: GolferRow[] = (entries ?? []).map((e) => {
      const g = e.golfers as unknown as {
        id: string;
        name: string;
        pga_player_num: string | null;
        owgr_rank: number | null;
      } | null;
      const price = priceById.get(e.golfer_id);
      const res = resultById.get(e.golfer_id);
      return {
        golfer_id: e.golfer_id,
        name: g?.name ?? "Golfer",
        salary: price?.salary ?? 0,
        decimal_odds: price?.decimal_odds ?? null,
        pga_player_num: g?.pga_player_num ?? null,
        owgr_rank: g?.owgr_rank ?? null,
        position: res?.position ?? null,
        total_to_par: res?.total_to_par ?? null,
        fantasy_points: Number(res?.fantasy_points ?? 0),
        made_cut: res?.made_cut ?? false,
        status: res?.status ?? null,
        birdies: Number(res?.birdies ?? 0),
        eagles: Number(res?.eagles ?? 0),
      };
    });

    // Sort by fantasy points desc for live feel
    next.sort((a, b) => b.fantasy_points - a.fantasy_points);
    setRows(next);

    const liveSum = next.reduce((s, r) => s + r.fantasy_points, 0);
    setLineupTotal(liveSum || Number(lineup.total_points ?? 0));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId, tournamentQuery, user?.id]);

  useEffect(() => {
    if (!tournament) return;
    const channel = supabase
      .channel(`lineup-view-${leagueId}-${userId}-${tournament.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_results",
          filter: `tournament_id=eq.${tournament.id}`,
        },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${leagueId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId, tournament?.id]);

  const subtitle = useMemo(() => {
    if (!tournament) return "";
    const lockLabel = tournament.lineup_lock_at
      ? new Date(tournament.lineup_lock_at).toLocaleString()
      : null;
    return locked
      ? `Locked${lockLabel ? ` · ${lockLabel}` : ""} · Live points`
      : "Unlocked · Your lineup preview";
  }, [tournament, locked]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading lineup…</div>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <Link
          to="/league/$id"
          params={{ id: leagueId }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to league
        </Link>
        <div className="rounded-lg border bg-card p-8 text-center">
          <Lock className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h2 className="text-lg font-bold">Lineups still open</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Other members&apos; lineups become visible after first tee / lock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link
        to="/league/$id"
        params={{ id: leagueId }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {leagueName}
      </Link>

      <div className="rounded-lg bg-slate-900 px-5 py-5 text-white">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          {isOwn ? "Your lineup" : "Member lineup"}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{ownerName}</h1>
        <p className="mt-1 text-sm text-slate-300">{tournament?.name ?? "No event"}</p>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-6">
          <div>
            <div className="text-xs uppercase text-slate-400">Lineup points</div>
            <div className="font-mono text-2xl font-bold text-emerald-400">
              {lineupTotal.toFixed(1)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-slate-400">Spent</div>
            <div className="font-mono text-2xl font-bold">${totalSpent.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No lineup submitted for this event.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Golfer</th>
                    <th className="px-3 py-2 text-right">Pos</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">Cut</th>
                    <th className="px-3 py-2 text-right">Finish</th>
                    <th className="px-3 py-2 text-right">Birdies</th>
                    <th className="px-3 py-2 text-right">Eagles</th>
                    <th className="px-3 py-2 text-right">Under</th>
                    <th className="px-4 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bd = breakdownFantasyPoints({
                      position: r.position,
                      madeCut: r.made_cut,
                      totalToPar: r.total_to_par,
                      birdies: r.birdies,
                      eagles: r.eagles,
                    });
                    const pts = r.fantasy_points || bd.total;
                    return (
                      <tr key={r.golfer_id} className="border-t">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <GolferAvatar name={r.name} pgaPlayerNum={r.pga_player_num} />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-900">{r.name}</div>
                              <div className="text-xs text-slate-500">
                                {formatAmericanOdds(r.decimal_odds)} · {formatOwgr(r.owgr_rank)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {formatPos(r.position, r.status)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {formatToPar(r.total_to_par)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">{bd.cut}</td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">{bd.finish}</td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {bd.birdieCount}
                          <span className="ml-1 text-xs text-slate-400">({bd.birdies})</span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {bd.eagleCount}
                          <span className="ml-1 text-xs text-slate-400">({bd.eagles})</span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">{bd.underPar}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                          {pts.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50">
                    <td
                      colSpan={8}
                      className="px-4 py-3 text-right text-xs font-semibold uppercase text-slate-500"
                    >
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-lg font-bold text-emerald-700">
                      {lineupTotal.toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="border-t px-4 py-3 text-xs text-slate-500">
              Cut +10 · Birdie +1 · Eagle +3 · Under-par +1/stroke · Finish by place (1st +50 … made
              cut +4). Updates live when scores sync.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
