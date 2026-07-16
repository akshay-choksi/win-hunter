import { createFileRoute, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, X, AlertTriangle, Search, Wand2, Lock } from "lucide-react";
import { formatOdds, isLineupLocked, type Tournament } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/league/$id/draft")({
  component: DraftPage,
});

type Golfer = {
  id: string;
  name: string;
  salary: number;
  decimal_odds: number | null;
};

function DraftPage() {
  const { id: leagueId } = useParams({ from: "/_authenticated/league/$id/draft" });
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
        .in("status", ["open", "in_progress", "scheduled"])
        .order("start_date", { ascending: true });

      const active =
        (tournaments ?? []).find((t) => t.status === "open") ??
        (tournaments ?? []).find((t) => t.status === "in_progress") ??
        (tournaments ?? [])[0] ??
        null;
      setTournament(active as Tournament | null);

      if (!active) {
        setGolfers([]);
        setLoading(false);
        return;
      }

      const { data: prices } = await supabase
        .from("player_prices")
        .select("salary, decimal_odds, golfers(id, name)")
        .eq("tournament_id", active.id)
        .order("salary", { ascending: false });

      const pool: Golfer[] = (prices ?? [])
        .map((row) => {
          const g = row.golfers as unknown as { id: string; name: string } | null;
          if (!g) return null;
          return {
            id: g.id,
            name: g.name,
            salary: row.salary,
            decimal_odds: row.decimal_odds,
          };
        })
        .filter((g): g is Golfer => !!g);

      setGolfers(pool);
      setLoading(false);
    })();
  }, [leagueId]);

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
          .select("golfer_id, golfers(id, name)")
          .eq("lineup_id", lineup.id);

        const { data: prices } = await supabase
          .from("player_prices")
          .select("golfer_id, salary, decimal_odds")
          .eq("tournament_id", tournament.id);

        const priceById = new Map(
          (prices ?? []).map((p) => [p.golfer_id, { salary: p.salary, decimal_odds: p.decimal_odds }]),
        );

        const rostered = (entries ?? [])
          .map((e) => {
            const g = e.golfers as unknown as { id: string; name: string } | null;
            if (!g) return null;
            const price = priceById.get(g.id);
            return {
              id: g.id,
              name: g.name,
              salary: price?.salary ?? 0,
              decimal_odds: price?.decimal_odds ?? null,
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
  const overCap = total > salaryCap;
  const complete = roster.length === rosterSize;
  const canSubmit = complete && !overCap && !saving && !locked && !!tournament;

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
    setRoster((r) => [...r, g]);
  }
  function drop(id: string) {
    if (locked) return toast.error("Lineups are locked for this event");
    setRoster((r) => r.filter((g) => g.id !== id));
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
      await supabase.from("lineups").update({ total_spent: total }).eq("id", lid);
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

  const pct = Math.min(100, (total / salaryCap) * 100);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading draft…</div>;
  }

  if (!tournament) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-bold">No active tournament</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask an admin to sync tournament odds before drafting.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={`p-4 ${overCap ? "border-red-500" : ""}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-lg">Draft your lineup</h2>
            <p className="text-xs text-muted-foreground">
              {tournament.name} · Pick {rosterSize} golfers, stay at or under $
              {salaryCap.toLocaleString()}.
              {tournament.lineup_lock_at && (
                <>
                  {" "}
                  Locks {new Date(tournament.lineup_lock_at).toLocaleString()}.
                </>
              )}
            </p>
          </div>
          <div className="text-right">
            <div
              className={`text-2xl font-bold font-mono ${overCap ? "text-red-600" : "text-foreground"}`}
            >
              ${total.toLocaleString()}{" "}
              <span className="text-sm text-muted-foreground">/ ${salaryCap.toLocaleString()}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {roster.length} / {rosterSize} golfers
            </div>
          </div>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${overCap ? "bg-red-600" : "bg-emerald-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {locked && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-700">
            <Lock className="h-4 w-4" />
            Lineups are locked for this event.
          </div>
        )}
        {overCap && !locked && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            Over cap by ${(total - salaryCap).toLocaleString()}. Drop a golfer to submit.
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search golfers…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs uppercase text-muted-foreground shadow-sm">
                <tr>
                  <th className="px-4 py-2">Golfer</th>
                  <th className="px-4 py-2 text-right">Odds</th>
                  <th className="px-4 py-2 text-right">Salary</th>
                  <th className="px-4 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      No golfers available. Ask an admin to sync tournament odds.
                    </td>
                  </tr>
                )}
                {filtered.map((g) => (
                  <tr key={g.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{g.name}</div>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {formatOdds(g.decimal_odds)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">${g.salary.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <Button
                        size="icon"
                        className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => draft(g)}
                        disabled={roster.length >= rosterSize || locked}
                        aria-label={`Draft ${g.name}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="border-b p-3">
            <h3 className="font-semibold">My Roster</h3>
          </div>
          <div className="space-y-2 p-3">
            {Array.from({ length: rosterSize }).map((_, i) => {
              const g = roster[i];
              return g ? (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      ${g.salary.toLocaleString()} · {formatOdds(g.decimal_odds)}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => drop(g.id)}
                    disabled={locked}
                    aria-label={`Remove ${g.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  key={`slot-${i}`}
                  className="flex h-14 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground"
                >
                  Slot {i + 1} — empty
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-muted-foreground">
          {locked
            ? "Lineups locked."
            : complete
              ? overCap
                ? "Over the cap."
                : "Ready to submit."
              : `Pick ${rosterSize - roster.length} more golfer${rosterSize - roster.length === 1 ? "" : "s"}.`}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled title="Coming soon">
            <Wand2 className="mr-2 h-4 w-4" /> Auto-Optimize
          </Button>
          <Button onClick={submit} disabled={!canSubmit} size="lg">
            {saving ? "Submitting…" : "Submit Lineup"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
