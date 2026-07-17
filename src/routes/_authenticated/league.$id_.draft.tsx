import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, X, Search, Lock, ArrowLeft, Eye } from "lucide-react";
import { GolferAvatar } from "@/components/golfer-avatar";
import {
  formatAmericanOdds,
  isLineupLocked,
  pickActiveTournament,
  type Tournament,
} from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/league/$id_/draft")({
  validateSearch: (search: Record<string, unknown>) => ({
    tournament: typeof search.tournament === "string" ? search.tournament : undefined,
  }),
  component: DraftPage,
});

type Golfer = {
  id: string;
  name: string;
  salary: number;
  decimal_odds: number | null;
  pga_player_num: string | null;
  owgr_rank: number | null;
};

function formatOwgr(rank: number | null | undefined): string {
  if (rank == null || !Number.isFinite(rank)) return "OWGR —";
  return `OWGR ${rank}`;
}

function DraftPage() {
  const { id: leagueId } = Route.useParams();
  const { tournament: tournamentQuery } = Route.useSearch();
  const { user } = useAuth();
  const router = useRouter();

  const [salaryCap, setSalaryCap] = useState(50000);
  const [rosterSize, setRosterSize] = useState(6);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [roster, setRoster] = useState<Golfer[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineupId, setLineupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const locked = tournament ? isLineupLocked(tournament) : false;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: league } = await supabase
        .from("leagues")
        .select("salary_cap, max_players")
        .eq("id", leagueId)
        .maybeSingle();
      if (league) {
        setSalaryCap(league.salary_cap);
        setRosterSize(league.max_players);
      }

      const { data: tournaments } = await supabase
        .from("tournaments")
        .select(
          "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at",
        )
        .order("start_date", { ascending: true });

      const list = (tournaments ?? []) as Tournament[];
      const fromQuery = tournamentQuery ? list.find((t) => t.id === tournamentQuery) : null;
      const active = fromQuery ?? pickActiveTournament(list);
      setTournament(active);

      if (!active) {
        setGolfers([]);
        setLoading(false);
        return;
      }

      const { data: prices } = await supabase
        .from("player_prices")
        .select("salary, decimal_odds, golfers(id, name, pga_player_num, owgr_rank)")
        .eq("tournament_id", active.id)
        .order("salary", { ascending: false });

      const pool: Golfer[] = (prices ?? [])
        .map((row) => {
          const g = row.golfers as unknown as {
            id: string;
            name: string;
            pga_player_num: string | null;
            owgr_rank: number | null;
          } | null;
          if (!g) return null;
          return {
            id: g.id,
            name: g.name,
            salary: row.salary,
            decimal_odds: row.decimal_odds,
            pga_player_num: g.pga_player_num,
            owgr_rank: g.owgr_rank,
          };
        })
        .filter((g): g is Golfer => !!g);

      setGolfers(pool);
      setLoading(false);
    })();
  }, [leagueId, tournamentQuery]);

  useEffect(() => {
    if (!user || !tournament) return;
    (async () => {
      const { data: lineup } = await supabase
        .from("lineups")
        .select("id")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .eq("tournament_id", tournament.id)
        .maybeSingle();
      if (lineup) {
        setLineupId(lineup.id);
        const { data: entries } = await supabase
          .from("lineup_entries")
          .select("golfer_id, golfers(id, name, pga_player_num, owgr_rank)")
          .eq("lineup_id", lineup.id);

        const { data: prices } = await supabase
          .from("player_prices")
          .select("golfer_id, salary, decimal_odds")
          .eq("tournament_id", tournament.id);

        const priceById = new Map(
          (prices ?? []).map((p) => [
            p.golfer_id,
            { salary: p.salary, decimal_odds: p.decimal_odds },
          ]),
        );

        const rostered = (entries ?? [])
          .map((e) => {
            const g = e.golfers as unknown as {
              id: string;
              name: string;
              pga_player_num: string | null;
              owgr_rank: number | null;
            } | null;
            if (!g) return null;
            const price = priceById.get(g.id);
            return {
              id: g.id,
              name: g.name,
              salary: price?.salary ?? 0,
              decimal_odds: price?.decimal_odds ?? null,
              pga_player_num: g.pga_player_num,
              owgr_rank: g.owgr_rank,
            } satisfies Golfer;
          })
          .filter((g): g is Golfer => !!g);
        setRoster(rostered);
      } else {
        setLineupId(null);
        setRoster([]);
      }
    })();
  }, [user, leagueId, tournament?.id]);

  const total = useMemo(() => roster.reduce((s, g) => s + g.salary, 0), [roster]);
  const remaining = salaryCap - total;
  const overCap = total > salaryCap;
  const complete = roster.length === rosterSize;
  const slotsLeft = rosterSize - roster.length;
  const avgRem = slotsLeft > 0 ? Math.floor(Math.max(remaining, 0) / slotsLeft) : 0;
  const canSubmit = complete && !overCap && !saving && !locked && !!tournament;
  const validGreen = complete && !overCap;

  const filtered = useMemo(() => {
    const rosterIds = new Set(roster.map((r) => r.id));
    const q = search.toLowerCase().trim();
    return golfers
      .filter((g) => !rosterIds.has(g.id))
      .filter((g) => (q ? g.name.toLowerCase().includes(q) : true));
  }, [golfers, roster, search]);

  function draft(g: Golfer) {
    if (locked) return toast.error("Lineups are locked for this event");
    if (roster.length >= rosterSize) return toast.error("Roster is full");
    if (total + g.salary > salaryCap) {
      return toast.error("That golfer would put you over the salary cap");
    }
    setRoster((r) => [...r, g]);
  }
  function drop(id: string) {
    if (locked) return toast.error("Lineups are locked for this event");
    setRoster((r) => r.filter((g) => g.id !== id));
  }
  function clear() {
    if (locked) return;
    setRoster([]);
  }

  async function submit() {
    if (!user || !canSubmit || !tournament) return;
    setSaving(true);
    let lid = lineupId;
    if (!lid) {
      const { data, error } = await supabase
        .from("lineups")
        .insert({
          league_id: leagueId,
          user_id: user.id,
          tournament_id: tournament.id,
          total_spent: total,
          total_points: 0,
        })
        .select("id")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Failed to create lineup");
        setSaving(false);
        return;
      }
      lid = data.id;
      setLineupId(lid);
    } else {
      const { error: updErr } = await supabase
        .from("lineups")
        .update({ total_spent: total })
        .eq("id", lid);
      if (updErr) {
        toast.error(updErr.message);
        setSaving(false);
        return;
      }
      await supabase.from("lineup_entries").delete().eq("lineup_id", lid);
    }
    const { error: eErr } = await supabase
      .from("lineup_entries")
      .insert(roster.map((g) => ({ lineup_id: lid!, golfer_id: g.id })));
    if (eErr) {
      toast.error(eErr.message);
      setSaving(false);
      return;
    }
    toast.success("Lineup submitted!");
    setSaving(false);
    router.navigate({ to: "/league/$id", params: { id: leagueId } });
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading draft…</div>;
  }

  if (!tournament) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <h2 className="text-lg font-bold">No active tournament</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask an admin to sync tournament odds before drafting.
        </p>
      </div>
    );
  }

  if (locked) {
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
          <h2 className="text-lg font-bold">Lineups are locked</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tournament.name} locked
            {tournament.lineup_lock_at
              ? ` at ${new Date(tournament.lineup_lock_at).toLocaleString()}`
              : ""}
            . You can view submitted lineups and live points.
          </p>
          {user && (
            <Link
              to="/league/$id/lineup/$userId"
              params={{ id: leagueId, userId: user.id }}
              search={{ tournament: tournament.id }}
              className="mt-4 inline-block"
            >
              <Button>
                <Eye className="mr-2 h-4 w-4" /> View my lineup
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-0 pb-28">
      <div className="rounded-t-lg bg-slate-900 px-4 py-4 text-white">
        <Link
          to="/league/$id"
          params={{ id: leagueId }}
          className="mb-2 inline-flex items-center gap-1 text-xs text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> League
        </Link>
        <h1 className="text-xl font-bold tracking-tight">Create Lineup</h1>
        <p className="mt-1 text-sm text-slate-300">{tournament.name}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>Cap ${salaryCap.toLocaleString()}</span>
          <span>{rosterSize} golfers</span>
          {tournament.lineup_lock_at && (
            <span>Locks {new Date(tournament.lineup_lock_at).toLocaleString()}</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white"
            onClick={clear}
            disabled={roster.length === 0}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
            onClick={submit}
            disabled={!canSubmit}
          >
            {saving ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>

      <div className="border-x border-b bg-white">
        <div className="border-b bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          My Lineup
        </div>
        {Array.from({ length: rosterSize }).map((_, i) => {
          const g = roster[i];
          return g ? (
            <div key={g.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
              <GolferAvatar name={g.name} pgaPlayerNum={g.pga_player_num} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-900">{g.name}</div>
                <div className="text-xs text-slate-500">
                  {formatAmericanOdds(g.decimal_odds)} · {formatOwgr(g.owgr_rank)}
                </div>
              </div>
              <div className="text-right font-mono text-base font-bold text-slate-900">
                ${g.salary.toLocaleString()}
              </div>
              <button
                type="button"
                onClick={() => drop(g.id)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300"
                aria-label={`Remove ${g.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 border-b px-4 py-3 text-sm text-slate-400 last:border-b-0"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-dashed border-slate-300 text-xs font-bold">
                G
              </span>
              Select a golfer
            </div>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border bg-white">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search golfers…"
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Golfer</th>
                <th className="px-4 py-2 text-right">Odds</th>
                <th className="px-4 py-2 text-right">Salary</th>
                <th className="w-12 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No golfers available. Ask an admin to sync tournament odds.
                  </td>
                </tr>
              )}
              {filtered.map((g) => {
                const overBudget = g.salary > remaining;
                const rosterFull = roster.length >= rosterSize;
                const canAdd = !overBudget && !rosterFull;
                return (
                  <tr
                    key={g.id}
                    className={`border-t hover:bg-slate-50 ${overBudget ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <GolferAvatar name={g.name} pgaPlayerNum={g.pga_player_num} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900">{g.name}</div>
                          <div className="text-xs text-slate-500">{formatOwgr(g.owgr_rank)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {formatAmericanOdds(g.decimal_odds)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">
                      ${g.salary.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="icon"
                        className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => draft(g)}
                        disabled={!canAdd}
                        aria-label={`Add ${g.name}`}
                        title={
                          overBudget
                            ? "Over remaining salary"
                            : rosterFull
                              ? "Roster is full"
                              : `Add ${g.name}`
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-700 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-xs uppercase text-slate-400">Positions Filled</div>
            <div className={`text-lg font-bold ${validGreen ? "text-emerald-400" : "text-white"}`}>
              {roster.length}/{rosterSize}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-400">Rem Salary</div>
            <div
              className={`font-mono text-lg font-bold ${
                overCap
                  ? "text-red-400"
                  : remaining === 0 && complete
                    ? "text-emerald-400"
                    : "text-white"
              }`}
            >
              {overCap
                ? `-$${Math.abs(remaining).toLocaleString()}`
                : `$${remaining.toLocaleString()}`}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-400">Avg Rem/Player</div>
            <div
              className={`font-mono text-lg font-bold ${
                complete && remaining === 0 ? "text-emerald-400" : "text-white"
              }`}
            >
              ${avgRem.toLocaleString()}
            </div>
          </div>
          <Button
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40"
            onClick={submit}
            disabled={!canSubmit}
          >
            {saving ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
