import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { GolferAvatar } from "@/components/golfer-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  breakdownFantasyPoints,
  formatAmericanOdds,
  isLineupLocked,
  pickActiveTournament,
  type Tournament,
} from "@/lib/scoring";
import { initialsFromName } from "@/lib/profile";

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
  pars: number;
  bogeys: number;
  double_bogeys: number;
  double_eagles: number;
  bonus_points: number;
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

function formatPts(n: number): string {
  if (n === 0) return "0";
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return n > 0 ? `+${rounded}` : rounded;
}

/** Display count + points for hole/place breakdown cells. */
function StatPts({ count, pts }: { count?: number; pts: number }) {
  return (
    <span className="inline-flex flex-col items-end gap-0.5 leading-tight">
      {count != null ? <span className="font-mono text-slate-800">{count}</span> : null}
      <span className={`font-mono text-xs ${pts < 0 ? "text-red-600" : "text-emerald-700/80"}`}>
        {formatPts(pts)}
      </span>
    </span>
  );
}

function LineupViewerPage() {
  const { id: leagueId, userId } = Route.useParams();
  const { tournament: tournamentQuery } = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const viewerIdRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  viewerIdRef.current = user?.id ?? null;

  const [leagueName, setLeagueName] = useState("");
  const [ownerName, setOwnerName] = useState("Player");
  const [ownerAvatarUrl, setOwnerAvatarUrl] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rows, setRows] = useState<GolferRow[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [lineupTotal, setLineupTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const isOwn = Boolean(user?.id && user.id === userId);
  const locked = tournament ? isLineupLocked(tournament) : false;

  async function load() {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setForbidden(false);

    const { data: league } = await supabase
      .from("leagues")
      .select("name")
      .eq("id", leagueId)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setLeagueName(league?.name ?? "League");

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setOwnerName(profile?.full_name ?? "Player");
    setOwnerAvatarUrl(profile?.avatar_url ?? null);

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
    if (gen !== loadGenRef.current) return;
    setTournament(active);

    if (!active) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: syncState } = await supabase
      .from("result_sync_state")
      .select("last_completed_at")
      .eq("tournament_id", active.id)
      .maybeSingle();
    if (gen !== loadGenRef.current) return;
    setLastSyncedAt(syncState?.last_completed_at ?? null);

    // Wait for auth — `user == null` must not be treated as "viewing someone else"
    // or a stale in-flight load can flash/stick the lock screen on your own lineup.
    const viewerId = viewerIdRef.current;
    if (!viewerId) {
      setLoading(true);
      return;
    }
    const viewingOthers = viewerId !== userId;
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
    if (gen !== loadGenRef.current) return;

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
        : Promise.resolve({
            data: [] as { golfer_id: string; salary: number; decimal_odds: number | null }[],
          }),
      golferIds.length
        ? supabase
            .from("player_results")
            .select(
              "golfer_id, position, total_to_par, fantasy_points, made_cut, status, birdies, eagles, pars, bogeys, double_bogeys, double_eagles, bonus_points",
            )
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
              pars: number;
              bogeys: number;
              double_bogeys: number;
              double_eagles: number;
              bonus_points: number;
            }[],
          }),
    ]);
    if (gen !== loadGenRef.current) return;

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
        pars: Number(res?.pars ?? 0),
        bogeys: Number(res?.bogeys ?? 0),
        double_bogeys: Number(res?.double_bogeys ?? 0),
        double_eagles: Number(res?.double_eagles ?? 0),
        bonus_points: Number(res?.bonus_points ?? 0),
      };
    });

    // Sort by fantasy points desc for live feel
    next.sort((a, b) => b.fantasy_points - a.fantasy_points);
    setRows(next);

    const liveSum = next.reduce((s, r) => s + r.fantasy_points, 0);
    setLineupTotal(liveSum || Number(lineup.total_points ?? 0));
    setLoading(false);
  }

  async function refreshLiveScores() {
    if (!tournament || refreshing) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-results", {
        body: { tournament_id: tournament.id, league_id: leagueId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastSyncedAt(data?.lastSyncedAt ?? new Date().toISOString());
      await load();
      toast.success(data?.cached ? "Scores are already current" : "Live scores refreshed", {
        description: data?.message,
      });
    } catch (err) {
      toast.error("Could not refresh scores", {
        description: err instanceof Error ? err.message : "Try again in a moment.",
      });
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId, tournamentQuery, user?.id, authLoading]);

  useEffect(() => {
    if (!tournament) return;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleLoad = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (viewerIdRef.current) void load();
      }, 350);
    };
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
        scheduleLoad,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${leagueId}` },
        scheduleLoad,
      )
      .subscribe();
    return () => {
      clearTimeout(refreshTimer);
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
            Other members&apos; lineups stay hidden until lock (first tee). You can always open yours
            from &quot;View my lineup&quot; or your name marked you.
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar className="mt-0.5 h-12 w-12 border border-white/20">
              {ownerAvatarUrl ? <AvatarImage src={ownerAvatarUrl} alt="" /> : null}
              <AvatarFallback className="bg-white/10 text-sm font-semibold text-white">
                {initialsFromName(ownerName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {isOwn ? "Your lineup" : "Member lineup"}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">{ownerName}</h1>
              <p className="mt-1 text-sm text-slate-300">{tournament?.name ?? "No event"}</p>
              <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
            </div>
          </div>
          {tournament?.status === "in_progress" ? (
            <div className="text-right">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshLiveScores}
                disabled={refreshing}
                className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <RefreshCw className={refreshing ? "animate-spin" : ""} />
                {refreshing ? "Refreshing…" : "Refresh live scores"}
              </Button>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {lastSyncedAt
                  ? `Updated ${new Date(lastSyncedAt).toLocaleTimeString()}`
                  : "Uses live DataGolf results"}
              </p>
            </div>
          ) : null}
        </div>
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
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Golfer</th>
                    <th className="px-3 py-2 text-right">Pos</th>
                    <th className="px-3 py-2 text-right">Score</th>
                    <th className="px-3 py-2 text-right">Place</th>
                    <th className="px-3 py-2 text-right">Birdies</th>
                    <th className="px-3 py-2 text-right">Eagles</th>
                    <th className="px-3 py-2 text-right">Pars</th>
                    <th className="px-3 py-2 text-right">Bogeys</th>
                    <th className="px-3 py-2 text-right">Dbl+</th>
                    <th className="px-3 py-2 text-right">Bonus</th>
                    <th className="px-4 py-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const bd = breakdownFantasyPoints({
                      position: r.position,
                      doubleEagles: r.double_eagles,
                      eagles: r.eagles,
                      birdies: r.birdies,
                      pars: r.pars,
                      bogeys: r.bogeys,
                      doubleBogeys: r.double_bogeys,
                      bonusPoints: r.bonus_points,
                    });
                    const pts = r.fantasy_points || bd.total;
                    const eagleCount = bd.eagleCount + bd.doubleEagleCount;
                    const eaglePts = bd.eaglePts + bd.doubleEaglePts;
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
                        <td className="px-3 py-3 text-right">
                          <StatPts pts={bd.finish} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.birdieCount} pts={bd.birdiePts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={eagleCount} pts={eaglePts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.parCount} pts={bd.parPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.bogeyCount} pts={bd.bogeyPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts count={bd.doubleBogeyCount} pts={bd.doubleBogeyPts} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <StatPts pts={bd.bonusPoints} />
                        </td>
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
                      colSpan={10}
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
              Each column shows count (when applicable) and points earned. DK Classic: Eagle +8 ·
              Birdie +3 · Par +0.5 · Bogey −0.5 · Double+ −1 · Place live (1st +30 … 50th +1).
            </p>
          </>
        )}
      </div>
    </div>
  );
}
