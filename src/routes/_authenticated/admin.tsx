import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldAlert, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user, loading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data?.is_admin));
  }, [user]);

  async function syncOdds() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-odds");
      if (error) throw error;
      toast.success("Tournament odds synced", {
        description: data?.message ?? "Golfer pool updated.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync odds";
      toast.error("Sync failed", { description: message });
    } finally {
      setSyncing(false);
    }
  }

  if (loading || isAdmin === null) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking access…
      </div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage tournament data and golfer pool.</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold">Tournament Odds</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pull the latest odds and salaries from the data provider and refresh the golfer pool.
        </p>
        <Button onClick={syncOdds} disabled={syncing} className="mt-4">
          {syncing ? (
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
    </div>
  );
}
