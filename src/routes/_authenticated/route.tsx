import {
  ClientOnly,
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Flag } from "lucide-react";
import { RouteShell } from "@/components/route-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Full document navigation avoids hydrating /auth against the / shell HTML.
      throw redirect({ to: "/auth", reloadDocument: true });
    }
  },
  pendingComponent: RouteShell,
  component: () => (
    <ClientOnly fallback={<RouteShell />}>
      <AuthedLayout />
    </ClientOnly>
  ),
});

function AuthedLayout() {
  const { user } = useAuth();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true, reloadDocument: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold text-lg">
            <Flag className="h-5 w-5 text-emerald-600" />
            <span>WinHunters</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              Admin
            </Link>
            {user?.email && (
              <span className="hidden sm:inline text-sm text-muted-foreground truncate max-w-[180px]">
                {user.email}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
