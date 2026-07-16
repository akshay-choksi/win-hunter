import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  ShieldAlert,
  Shield,
  Flag,
  Trophy,
} from "lucide-react";
import type { Tournament } from "@/lib/scoring";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [syncingOdds, setSyncingOdds] = useState(false);
  const [syncingResults, setSyncingResults] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function checkAdminAccess(userId: string) {
    setIsAdmin(null);
    setAccessError(null);

    // Prefer SECURITY DEFINER RPC (avoids RLS edge cases on profiles).
    const { data: rpcAdmin, error: rpcError } = await supabase.rpc("am_i_admin");
    if (!rpcError) {
      setIsAdmin(rpcAdmin === true);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      setAccessError(`${rpcError.message} | fallback: ${error.message}`);
      setIsAdmin(false);
      return;
    }

    setIsAdmin(data?.is_admin === true);
  }

  async function loadTournaments() {
    const { data } = await supabase
      .from("tournaments")
      .select(
        "id, dg_event_id, name, start_date, end_date, season_year, event_type, fedex_multiplier, status, lineup_lock_at",
      )
      .order("start_date", { ascending: false })
      .limit(25);
    const list = (data ?? []) as Tournament[];
    setTournaments(list);
    setSelectedId((prev) => {
      if (prev && list.some((t) => t.id === prev)) return prev;
      return (
        list.find((t) => t.status === "in_progress")?.id ??
        list.find((t) => t.status === "open")?.id ??
        list[0]?.id ??
        null
      );
    });
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setIsAdmin(false);
      setAccessError(null);
      return;
    }
    checkAdminAccess(user.id);
  }, [loading, user?.id]);

  useEffect(() => {
    if (isAdmin) loadTournaments();
  }, [isAdmin]);

  async function syncOdds() {
    setSyncingOdds(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Tournament odds synced", {
        description: data?.message ?? "Golfer pool updated.",
      });
      await loadTournaments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync odds";
      toast.error("Sync failed", { description: message });
    } finally {
      setSyncingOdds(false);
    }
  }

  async function syncResults() {
    setSyncingResults(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-results", {
        body: selectedId ? { tournament_id: selectedId } : {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Results synced", {
        description: data?.message ?? "Fantasy points updated.",
      });
      await loadTournaments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync results";
      toast.error("Sync failed", { description: message });
    } finally {
      setSyncingResults(false);
    }
  }

  async function finalizeEvent() {
    if (!selectedId) {
      toast.error("Select a tournament to finalize");
      return;
    }
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke("finalize-event", {
        body: { tournament_id: selectedId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Event finalized", {
        description: data?.message ?? "FedEx points awarded.",
      });
      await loadTournaments();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to finalize event";
      toast.error("Finalize failed", { description: message });
    } finally {
      setFinalizing(false);
    }
  }

  if (loading || isAdmin === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
      </div>
    );
  }

  if (accessError) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-600" />
        <h1 className="text-xl font-bold">Unable to verify admin access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account may be admin, but the profile check failed. Try again in a moment.
        </p>
        {accessError && (
          <p className="mt-2 break-words font-mono text-xs text-red-600">{accessError}</p>
        )}
        <Button className="mt-4" variant="outline" onClick={() => user && checkAdminAccess(user.id)}>
          Retry access check
        </Button>
      </Card>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-600" />
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to the admin dashboard.
        </p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </Card>
    );
  }

  const selected = tournaments.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Manage tournament data, odds pricing, and FedEx finals.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold">Tournament Odds</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pull schedule, field, and outright odds from DataGolf. Converts odds into salaries for the
          active event.
        </p>
        <Button onClick={syncOdds} disabled={syncingOdds} className="mt-4">
          {syncingOdds ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" /> Sync Tournament Odds
            </>
          )}
        </Button>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-semibold">Live Results & Finalize</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sync live scores into fantasy points, then finalize to award FedEx points by league
            finish.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 w-10"></th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Start</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    No tournaments yet. Sync odds first.
                  </td>
                </tr>
              )}
              {tournaments.map((t) => (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-t hover:bg-muted/30 ${selectedId === t.id ? "bg-emerald-50" : ""}`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="tournament"
                      checked={selectedId === t.id}
                      onChange={() => setSelectedId(t.id)}
                      aria-label={`Select ${t.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.start_date ?? "—"}</td>
                  <td className="px-3 py-2 text-xs capitalize">{t.event_type}</td>
                  <td className="px-3 py-2 text-xs capitalize">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && (
          <p className="text-xs text-muted-foreground">
            Selected: <span className="font-medium text-foreground">{selected.name}</span> · lock{" "}
            {selected.lineup_lock_at
              ? new Date(selected.lineup_lock_at).toLocaleString()
              : "unset"}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={syncResults} disabled={syncingResults || !selectedId} variant="secondary">
            {syncingResults ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Syncing…
              </>
            ) : (
              <>
                <Flag className="mr-2 h-4 w-4" /> Sync Results
              </>
            )}
          </Button>
          <Button
            onClick={finalizeEvent}
            disabled={finalizing || !selectedId || selected?.status === "completed"}
          >
            {finalizing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Finalizing…
              </>
            ) : (
              <>
                <Trophy className="mr-2 h-4 w-4" /> Finalize Event
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
