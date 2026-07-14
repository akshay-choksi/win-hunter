import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, ArrowLeft, Zap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/league/$id")({
  component: LeaguePage,
});

type LeagueRow = {
  id: string;
  name: string;
  invite_code: string;
  salary_cap: number;
  max_players: number;
};

type Standing = {
  user_id: string;
  full_name: string | null;
  total_spent: number;
  golfer_count: number;
};

function LeaguePage() {
  const { id } = useParams({ from: "/_authenticated/league/$id" });
  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);

  async function loadLeague() {
    const { data } = await supabase
      .from("leagues")
      .select("id, name, invite_code, salary_cap, max_players")
      .eq("id", id)
      .maybeSingle();
    setLeague(data);
  }

  async function loadStandings() {
    const { data: lineups } = await supabase
      .from("lineups")
      .select("id, user_id, total_spent")
      .eq("league_id", id);
    if (!lineups) return;
    const userIds = lineups.map((l) => l.user_id);
    const lineupIds = lineups.map((l) => l.id);

    const [{ data: profiles }, { data: entries }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      lineupIds.length
        ? supabase.from("lineup_entries").select("lineup_id").in("lineup_id", lineupIds)
        : Promise.resolve({ data: [] as { lineup_id: string }[] }),
    ]);

    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    const countByLineup = new Map<string, number>();
    (entries ?? []).forEach((e) => {
      countByLineup.set(e.lineup_id, (countByLineup.get(e.lineup_id) ?? 0) + 1);
    });

    const rows: Standing[] = lineups
      .map((l) => ({
        user_id: l.user_id,
        full_name: nameById.get(l.user_id) ?? "Player",
        total_spent: l.total_spent,
        golfer_count: countByLineup.get(l.id) ?? 0,
      }))
      .sort((a, b) => b.total_spent - a.total_spent);
    setStandings(rows);
  }

  useEffect(() => {
    loadLeague();
    loadStandings();
    const channel = supabase
      .channel(`league-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${id}` },
        () => loadStandings(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineup_entries" },
        () => loadStandings(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All leagues
      </Link>

      {league && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{league.name}</h1>
            <p className="text-sm text-muted-foreground">
              Invite code <span className="font-mono">{league.invite_code}</span> · Cap $
              {league.salary_cap.toLocaleString()}
            </p>
          </div>
          <Link to="/league/$id/draft" params={{ id }}>
            <Button size="lg">
              <Zap className="mr-2 h-4 w-4" /> Set lineup
            </Button>
          </Link>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-emerald-600" />
            <h2 className="font-semibold">Live Leaderboard</h2>
          </div>
          <span className="text-xs text-muted-foreground">Realtime</span>
        </div>
        {standings.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No lineups submitted yet. Be the first!
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/20 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-5 py-2 w-12">#</th>
                <th className="px-5 py-2">Player</th>
                <th className="px-5 py-2">Golfers</th>
                <th className="px-5 py-2 text-right">Spent</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.user_id} className="border-t">
                  <td className="px-5 py-3 font-mono text-muted-foreground">{i + 1}</td>
                  <td className="px-5 py-3 font-medium">{s.full_name ?? "Player"}</td>
                  <td className="px-5 py-3">{s.golfer_count} / 6</td>
                  <td className="px-5 py-3 text-right font-mono">
                    ${s.total_spent.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
