import { createFileRoute, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, X, AlertTriangle, Search, Wand2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/league/$id/draft")({
  component: DraftPage,
});

type Golfer = { id: string; name: string; salary: number; tournament_name: string | null };

const ROSTER_SIZE = 6;
const CAP = 50000;

function DraftPage() {
  const { id: leagueId } = useParams({ from: "/_authenticated/league/$id/draft" });
  const { user } = useAuth();
  const router = useRouter();

  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [roster, setRoster] = useState<Golfer[]>([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [lineupId, setLineupId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("golfers")
      .select("id, name, salary, tournament_name")
      .eq("is_active", true)
      .order("salary", { ascending: false })
      .then(({ data }) => setGolfers(data ?? []));
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: lineup } = await supabase
        .from("lineups")
        .select("id")
        .eq("league_id", leagueId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (lineup) {
        setLineupId(lineup.id);
        const { data: entries } = await supabase
          .from("lineup_entries")
          .select("golfer_id, golfers(id, name, salary, tournament_name)")
          .eq("lineup_id", lineup.id);
        const rostered = (entries ?? [])
          .map((e) => e.golfers as unknown as Golfer)
          .filter(Boolean);
        setRoster(rostered);
      }
    })();
  }, [user, leagueId]);

  const total = useMemo(() => roster.reduce((s, g) => s + g.salary, 0), [roster]);
  const overCap = total > CAP;
  const complete = roster.length === ROSTER_SIZE;
  const canSubmit = complete && !overCap && !saving;

  const filtered = useMemo(() => {
    const rosterIds = new Set(roster.map((r) => r.id));
    const q = search.toLowerCase().trim();
    return golfers
      .filter((g) => !rosterIds.has(g.id))
      .filter((g) => (q ? g.name.toLowerCase().includes(q) : true));
  }, [golfers, roster, search]);

  function draft(g: Golfer) {
    if (roster.length >= ROSTER_SIZE) return toast.error("Roster is full");
    setRoster((r) => [...r, g]);
  }
  function drop(id: string) {
    setRoster((r) => r.filter((g) => g.id !== id));
  }

  async function submit() {
    if (!user || !canSubmit) return;
    setSaving(true);
    let lid = lineupId;
    if (!lid) {
      const { data, error } = await supabase
        .from("lineups")
        .insert({ league_id: leagueId, user_id: user.id, total_spent: total })
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

  const pct = Math.min(100, (total / CAP) * 100);

  return (
    <div className="space-y-4">
      {/* Budget bar */}
      <Card className={`p-4 ${overCap ? "border-red-500" : ""}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-lg">Draft your lineup</h2>
            <p className="text-xs text-muted-foreground">
              Pick {ROSTER_SIZE} golfers, stay at or under ${CAP.toLocaleString()}.
            </p>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold font-mono ${overCap ? "text-red-600" : "text-foreground"}`}>
              ${total.toLocaleString()}{" "}
              <span className="text-sm text-muted-foreground">/ ${CAP.toLocaleString()}</span>
            </div>
            <div className="text-xs text-muted-foreground">{roster.length} / {ROSTER_SIZE} golfers</div>
          </div>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${overCap ? "bg-red-600" : "bg-emerald-600"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {overCap && (
          <div className="mt-2 flex items-center gap-1.5 text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            Over cap by ${(total - CAP).toLocaleString()}. Drop a golfer to submit.
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: Golfer pool */}
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
                  <th className="px-4 py-2 text-right">Salary</th>
                  <th className="px-4 py-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      No golfers available. Ask an admin to sync tournament odds.
                    </td>
                  </tr>
                )}
                {filtered.map((g) => (
                  <tr key={g.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2">
                      <div className="font-medium">{g.name}</div>
                      {g.tournament_name && (
                        <div className="text-xs text-muted-foreground">{g.tournament_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">${g.salary.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <Button
                        size="icon"
                        className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => draft(g)}
                        disabled={roster.length >= ROSTER_SIZE}
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

        {/* Right: Roster */}
        <Card className="flex flex-col overflow-hidden">
          <div className="border-b p-3">
            <h3 className="font-semibold">My Roster</h3>
          </div>
          <div className="space-y-2 p-3">
            {Array.from({ length: ROSTER_SIZE }).map((_, i) => {
              const g = roster[i];
              return g ? (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      ${g.salary.toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => drop(g.id)}
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

      {/* Footer submission */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-muted-foreground">
          {complete
            ? overCap
              ? "Over the cap."
              : "Ready to submit."
            : `Pick ${ROSTER_SIZE - roster.length} more golfer${ROSTER_SIZE - roster.length === 1 ? "" : "s"}.`}
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
