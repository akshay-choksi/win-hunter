import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { RouteShell } from "@/components/route-shell";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — WinHunters" },
      { name: "description", content: "Sign in to your fantasy golf salary cap league." },
    ],
  }),
  pendingComponent: RouteShell,
  component: () => (
    <ClientOnly fallback={<RouteShell />}>
      <AuthPage />
    </ClientOnly>
  ),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/", replace: true, reloadDocument: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/", replace: true, reloadDocument: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signInWithGoogle() {
    setLoading(true);
    // Must be listed under Supabase Auth → URL Configuration → Redirect URLs.
    // If missing, Supabase falls back to Site URL (often the Lovable preview).
    const redirectTo = `${window.location.origin}/auth`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-muted via-background to-muted px-4">
      <Card className="w-full max-w-md gap-0 p-8 shadow-lg shadow-primary/5">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
            <Flag className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">WinHunters</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fantasy golf salary cap pools with your crew.
          </p>
        </div>
        <Button onClick={signInWithGoogle} disabled={loading} className="w-full" size="lg">
          <GoogleIcon className="mr-2 h-5 w-5" />
          {loading ? "Redirecting…" : "Continue with Google"}
        </Button>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to play fair and finish your rounds.
        </p>
      </Card>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12S6.8 21.5 12 21.5c6.9 0 9.5-4.8 9.5-8.5 0-.6-.1-1-.1-1.5H12z"
      />
    </svg>
  );
}
