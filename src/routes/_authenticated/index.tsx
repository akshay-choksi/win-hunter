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
    const { data: memberships } = await supabase
      .from("league_members")
      .select("league_id")
      .eq("user_id", user.id);
    const ids = (memberships ?? []).map((m) => m.league_id);
    if (ids.length === 0) return setLeagues([]);
    const { data } = await supabase
      .from("leagues")
      .select("id, name, invite_code, salary_cap, max_players")
      .in("id", ids);
    setLeagues(data ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Your Leagues</h1>
          <p className="text-sm text-muted-foreground">
            Draft your six, stay under the cap, take the trophy.
          </p>
        </div>
        <div className="flex gap-2">
          <JoinLeague onJoined={load} />
          <CreateLeague onCreated={load} />
        </div>
      </div>

      {leagues === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-32 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : leagues.length === 0 ? (
        <Card className="p-10 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
          <h2 className="text-lg font-semibold">No leagues yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a league to invite friends, or join one with an invite code.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((l) => (
            <Card
              key={l.id}
              className="cursor-pointer p-5 transition hover:shadow-md"
              onClick={() =>
                router.navigate({ to: "/league/$id", params: { id: l.id } })
              }
            >
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-lg">{l.name}</h3>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-mono text-emerald-800">
                  {l.invite_code}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" /> {l.max_players} slots
                </span>
                <span>${l.salary_cap.toLocaleString()} cap</span>
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
  const [cap, setCap] = useState(50000);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!user || !name.trim()) return;
    setBusy(true);
    const invite_code = randCode();
    const { data, error } = await supabase
      .from("leagues")
      .insert({
        name: name.trim(),
        invite_code,
        salary_cap: cap,
        max_players: 6,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Failed to create league");
      setBusy(false);
      return;
    }
    const { error: mErr } = await supabase
      .from("league_members")
      .insert({ league_id: data.id, user_id: user.id });
    if (mErr) toast.error(mErr.message);
    else toast.success(`League created — invite code ${invite_code}`);
    setBusy(false);
    setOpen(false);
    setName("");
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" /> Create league
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new league</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ln">League name</Label>
            <Input
              id="ln"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="The Weekend Warriors"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap">Salary cap ($)</Label>
            <Input
              id="cap"
              type="number"
              value={cap}
              onChange={(e) => setCap(parseInt(e.target.value) || 50000)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create league"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinLeague({ onJoined }: { onJoined: () => void }) {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!user || !code.trim()) return;
    setBusy(true);
    const { data: league, error } = await supabase
      .from("leagues")
      .select("id")
      .eq("invite_code", code.trim().toUpperCase())
      .maybeSingle();
    if (error || !league) {
      toast.error("Invalid invite code");
      setBusy(false);
      return;
    }
    const { error: mErr } = await supabase
      .from("league_members")
      .insert({ league_id: league.id, user_id: user.id });
    if (mErr && !mErr.message.includes("duplicate")) {
      toast.error(mErr.message);
    } else {
      toast.success("Joined league!");
      setCode("");
      onJoined();
    }
    setBusy(false);
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Invite code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="w-32 font-mono uppercase"
      />
      <Button variant="outline" onClick={join} disabled={busy || !code.trim()}>
        <LogIn className="mr-1 h-4 w-4" /> Join
      </Button>
    </div>
  );
}
