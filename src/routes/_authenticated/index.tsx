import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trophy, Users, Plus, LogIn, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardPage,
});

type League = {
  id: string;
  name: string;
  invite_code: string;
  salary_cap: number;
  max_players: number;
};

function randCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [leagues, setLeagues] = useState<League[] | null>(null);

  async function load() {
    if (!user) return;
    const [{ data: memberships }, { data: created }] = await Promise.all([
      supabase.from("league_members").select("league_id").eq("user_id", user.id),
      supabase
        .from("leagues")
        .select("id, name, invite_code, salary_cap, max_players")
        .eq("created_by", user.id),
    ]);

    const memberIds = (memberships ?? []).map((m) => m.league_id);
    let memberLeagues: League[] = [];
    if (memberIds.length > 0) {
      const { data } = await supabase
        .from("leagues")
        .select("id, name, invite_code, salary_cap, max_players")
        .in("id", memberIds);
      memberLeagues = data ?? [];
    }

    const byId = new Map<string, League>();
    for (const league of [...(created ?? []), ...memberLeagues]) {
      byId.set(league.id, league);
    }
    setLeagues([...byId.values()]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Dashboard"
        title="Your leagues"
        description="Create a salary-cap pool or join with an invite code."
        actions={
          <>
            <JoinLeague onJoined={load} />
            <CreateLeague onCreated={load} />
          </>
        }
      />

      {leagues === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="gap-0 p-5 shadow-sm">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-4 h-3 w-24" />
              <Skeleton className="mt-2 h-3 w-40" />
            </Card>
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <Card className="gap-0 border-dashed p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-muted text-primary">
            <Trophy className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">No leagues yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Start one for your group or join with a code to begin drafting lineups.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <Card
              key={league.id}
              className="group cursor-pointer gap-0 overflow-hidden border-border/80 p-0 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              onClick={() => router.navigate({ to: "/league/$id", params: { id: league.id } })}
            >
              <div className="h-1.5 bg-gradient-to-r from-primary to-navy" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold tracking-tight">
                      {league.name}
                    </h3>
                    <p className="mt-1.5 font-mono text-xs text-muted-foreground">
                      Invite {league.invite_code}
                    </p>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-muted text-primary">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="open">Cap ${league.salary_cap.toLocaleString()}</StatusBadge>
                  <StatusBadge tone="muted">{league.max_players} golfers</StatusBadge>
                </div>
                <p className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  Open league <ArrowRight className="h-3.5 w-3.5" />
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateLeague({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user || !name.trim()) return;
    setSaving(true);
    const invite_code = randCode();
    const { data, error } = await supabase
      .from("leagues")
      .insert({
        name: name.trim(),
        invite_code,
        salary_cap: 50000,
        max_players: 6,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create league");
      setSaving(false);
      return;
    }
    const { error: memberError } = await supabase.from("league_members").insert({
      league_id: data.id,
      user_id: user.id,
    });
    if (memberError) {
      toast.error(memberError.message);
      setSaving(false);
      return;
    }
    toast.success("League created", { description: `Invite code ${invite_code}` });
    setName("");
    setOpen(false);
    setSaving(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create league
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a league</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="league-name">Name</Label>
            <Input
              id="league-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Skins"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinLeague({ onJoined }: { onJoined: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!user || !code.trim()) return;
    setSaving(true);
    const { data: league, error } = await supabase
      .from("leagues")
      .select("id, name")
      .eq("invite_code", code.trim().toUpperCase())
      .maybeSingle();
    if (error || !league) {
      toast.error(error?.message ?? "No league with that invite code");
      setSaving(false);
      return;
    }
    const { error: joinError } = await supabase.from("league_members").insert({
      league_id: league.id,
      user_id: user.id,
    });
    if (joinError) {
      toast.error(joinError.message);
      setSaving(false);
      return;
    }
    toast.success(`Joined ${league.name}`);
    setCode("");
    setOpen(false);
    setSaving(false);
    onJoined();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LogIn className="mr-2 h-4 w-4" /> Join league
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join with invite code</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              className="font-mono uppercase"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !code.trim()}>
            {saving ? "Joining…" : "Join"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
