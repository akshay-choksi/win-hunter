import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trophy, Users, Plus, LogIn } from "lucide-react";

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your leagues</h1>
          <p className="mt-1 text-muted-foreground">
            Create a pool or join with an invite code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <JoinLeague onJoined={load} />
          <CreateLeague onCreated={load} />
        </div>
      </div>

      {leagues === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : leagues.length === 0 ? (
        <Card className="p-10 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <h2 className="text-lg font-semibold">No leagues yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start one for your group or join with a code.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => (
            <Card
              key={league.id}
              className="cursor-pointer p-5 transition hover:border-emerald-600/50 hover:shadow-sm"
              onClick={() => router.navigate({ to: "/league/$id", params: { id: league.id } })}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{league.name}</h3>
                <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
              <p className="mt-2 font-mono text-xs text-muted-foreground">
                Code {league.invite_code}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cap ${league.salary_cap.toLocaleString()} · {league.max_players} golfers
              </p>
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
