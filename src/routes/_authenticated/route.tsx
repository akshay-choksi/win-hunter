import { ClientOnly, createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { RouteShell } from "@/components/route-shell";
import { AppHeader } from "@/components/app-header";

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
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
