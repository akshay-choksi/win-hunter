import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, ArrowLeft, Zap, Medal, Eye } from "lucide-react";
import { isLineupLocked, pickActiveTournament, type Tournament } from "@/lib/scoring";

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

type EventStanding = {
  user_id: string;
  full_name: string | null;
  total_spent: number;
  total_points: number;
  golfer_count: number;
};

type SeasonStanding = {
  user_id: string;
  full_name: string | null;
  fedex_points: number;
  events_played: number;
};

function LeaguePage() {
  const { id } = useParams({ from: "/_authenticated/league/$id" });
  const { user } = useAuth();
  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [eventStandings, setEventStandings] = useState<EventStanding[]>([]);
  const [seasonStandings, setSeasonStandings] = useState<SeasonStanding[]>([]);
  const seasonYear = useMemo(() => new Date().getFullYear(), []);

  async function loadLeague() {
    const { data } = await supabase
      .from("leagues")
      .select("id, name, invite_code, salary_cap, max_players")
      .eq("id", id)
      .maybeSingle();
    setLeague(data);
  }

  async function loadTournaments() {
    const { data } = await supabase
      .from("tournaments")
      .select(
        "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at",
      )
      .order("start_date", { ascending: false })
      .limit(40);
    const list = (data ?? []) as Tournament[];
    setTournaments(list);
    setSelectedTournamentId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return pickActiveTournament(list)?.id ?? list[0]?.id ?? null;
    });
  }

  async function loadEventStandings(tournamentId: string) {
    const { data: lineups } = await supabase
      .from("lineups")
      .select("id, user_id, total_spent, total_points")
      .eq("league_id", id)
      .eq("tournament_id", tournamentId);
    if (!lineups) {
      setEventStandings([]);
      return;
    }
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

    const rows: EventStanding[] = lineups
      .map((l) => ({
        user_id: l.user_id,
        full_name: nameById.get(l.user_id) ?? "Player",
        total_spent: l.total_spent,
        total_points: Number(l.total_points ?? 0),
        golfer_count: countByLineup.get(l.id) ?? 0,
      }))
      .sort((a, b) => b.total_points - a.total_points || b.total_spent - a.total_spent);
    setEventStandings(rows);
  }

  async function loadSeasonStandings() {
    const { data } = await supabase
      .from("season_standings")
      .select("user_id, fedex_points, events_played")
      .eq("league_id", id)
      .eq("season_year", seasonYear)
      .order("fedex_points", { ascending: false });

    const rows = data ?? [];
    const userIds = rows.map((r) => r.user_id);
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", userIds)
      : { data: [] as { id: string; full_name: string | null }[] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    setSeasonStandings(
      rows.map((r) => ({
        user_id: r.user_id,
        full_name: nameById.get(r.user_id) ?? "Player",
        fedex_points: Number(r.fedex_points ?? 0),
        events_played: r.events_played,
      })),
    );
  }

  useEffect(() => {
    loadLeague();
    loadTournaments();
    loadSeasonStandings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!selectedTournamentId) {
      setEventStandings([]);
      return;
    }
    loadEventStandings(selectedTournamentId);

    const channel = supabase
      .channel(`league-${id}-${selectedTournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineups", filter: `league_id=eq.${id}` },
        () => loadEventStandings(selectedTournamentId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lineup_entries" },
        () => loadEventStandings(selectedTournamentId),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_results",
          filter: `tournament_id=eq.${selectedTournamentId}`,
        },
        () => loadEventStandings(selectedTournamentId),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "season_standings", filter: `league_id=eq.${id}` },
        () => loadSeasonStandings(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedTournamentId]);

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) ?? null;
  const rosterSize = league?.max_players ?? 6;
  const locked = selectedTournament ? isLineupLocked(selectedTournament) : false;

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
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
            {selectedTournament?.lineup_lock_at && (
              <p className="mt-1 text-xs text-muted-foreground">
                {locked ? "Lineups locked" : "Lineups lock"}{" "}
                {new Date(selectedTournament.lineup_lock_at).toLocaleString()}
              </p>
            )}
          </div>
          {locked ? (
            user && (
              <Button size="lg" variant="outline" asChild>
                <Link
                  to="/league/$id/lineup/$userId"
                  params={{ id, userId: user.id }}
                  search={{ tournament: selectedTournamentId ?? undefined }}
                >
                  <Eye className="mr-2 h-4 w-4" /> View my lineup
                </Link>
              </Button>
            )
          ) : (
            <Button size="lg" asChild>
              <Link
                to="/league/$id/draft"
                params={{ id }}
                search={{ tournament: selectedTournamentId ?? undefined }}
              >
                <Zap className="mr-2 h-4 w-4" /> Set lineup
              </Link>
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="event">
        <TabsList>
          <TabsTrigger value="event">Event Leaderboard</TabsTrigger>
          <TabsTrigger value="season">Season Standings</TabsTrigger>
        </TabsList>

        <TabsContent value="event" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={selectedTournamentId ?? ""}
              onValueChange={(v) => setSelectedTournamentId(v)}
            >
              <SelectTrigger className="w-[min(100%,320px)]">
                <SelectValue placeholder="Select event" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTournament && (
              <span className="text-xs text-muted-foreground capitalize">
                {selectedTournament.event_type} · ×{selectedTournament.fedex_multiplier} Season Pts
              </span>
            )}
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold">
                  {selectedTournament?.name ?? "Event"} Leaderboard
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {locked ? "Live · Click a player to view lineup" : "Realtime"}
              </span>
            </div>
            {eventStandings.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No lineups submitted for this event yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 w-12">#</th>
                    <th className="px-5 py-2">Player</th>
                    <th className="px-5 py-2">Golfers</th>
                    <th className="px-5 py-2 text-right">Spent</th>
                    <th className="px-5 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {eventStandings.map((s, i) => {
                    const canView = locked || s.user_id === user?.id;
                    return (
                      <tr key={s.user_id} className="border-t hover:bg-muted/30">
                        <td className="px-5 py-3 font-mono text-muted-foreground">{i + 1}</td>
                        <td className="px-5 py-3 font-medium">
                          {canView ? (
                            <Link
                              to="/league/$id/lineup/$userId"
                              params={{ id, userId: s.user_id }}
                              search={{ tournament: selectedTournamentId ?? undefined }}
                              className="text-emerald-700 hover:underline"
                            >
                              {s.full_name ?? "Player"}
                            </Link>
                          ) : (
                            (s.full_name ?? "Player")
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {s.golfer_count} / {rosterSize}
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          ${s.total_spent.toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold">
                          {s.total_points.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="season">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 px-5 py-3">
              <div className="flex items-center gap-2">
                <Medal className="h-5 w-5 text-emerald-600" />
                <h2 className="font-semibold">{seasonYear} Season Standings</h2>
              </div>
              <span className="text-xs text-muted-foreground">Season Points</span>
            </div>
            {seasonStandings.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No season points yet. Finalize an event after it completes.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/20 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-2 w-12">#</th>
                    <th className="px-5 py-2">Player</th>
                    <th className="px-5 py-2 text-right">Events</th>
                    <th className="px-5 py-2 text-right">Season Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonStandings.map((s, i) => (
                    <tr key={s.user_id} className="border-t">
                      <td className="px-5 py-3 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="px-5 py-3 font-medium">{s.full_name ?? "Player"}</td>
                      <td className="px-5 py-3 text-right">{s.events_played}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">
                        {s.fedex_points.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
