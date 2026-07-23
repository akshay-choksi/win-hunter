import type { ReactNode } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Flag, LayoutGrid, LogOut, Shield, ChevronDown, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { initialsFromName } from "@/lib/profile";

export function AppHeader() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { isAdmin } = useIsAdmin();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true, reloadDocument: true });
  }

  const onLeagues = pathname === "/" || pathname.startsWith("/league");
  const onAdmin = pathname.startsWith("/admin");
  const displayName = profile?.full_name?.trim() || user?.email || "Account";
  const initials = initialsFromName(profile?.full_name, user?.email);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-card/85 backdrop-blur-md supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Link
          to="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25 transition group-hover:brightness-110">
            <Flag className="h-[18px] w-[18px]" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight text-foreground">WinHunters</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:block">
              Fantasy golf
            </span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          <NavLink to="/" active={onLeagues}>
            <LayoutGrid className="h-4 w-4" />
            Leagues
          </NavLink>
          {isAdmin ? (
            <NavLink to="/admin" active={onAdmin}>
              <Shield className="h-4 w-4" />
              Admin
            </NavLink>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 sm:hidden">
            <Button
              asChild
              variant={onLeagues ? "secondary" : "ghost"}
              size="sm"
              className={cn(onLeagues && "bg-brand-muted text-accent-foreground")}
            >
              <Link to="/">Leagues</Link>
            </Button>
            {isAdmin ? (
              <Button
                asChild
                variant={onAdmin ? "secondary" : "ghost"}
                size="sm"
                className={cn(onAdmin && "bg-brand-muted text-accent-foreground")}
              >
                <Link to="/admin">Admin</Link>
              </Button>
            ) : null}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 border-border/80 bg-background/60 pl-1.5 pr-2.5"
              >
                <Avatar className="h-6 w-6">
                  {profile?.avatar_url ? (
                    <AvatarImage src={profile.avatar_url} alt="" />
                  ) : null}
                  <AvatarFallback className="bg-navy text-[10px] font-semibold text-navy-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden max-w-[160px] truncate text-sm font-medium md:inline">
                  {displayName}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium truncate">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user?.email ?? "—"}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">
                  <UserRound className="h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="sm:hidden">
                <Link to="/">
                  <LayoutGrid className="h-4 w-4" />
                  Leagues
                </Link>
              </DropdownMenuItem>
              {isAdmin ? (
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link to="/admin">
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  to,
  active,
  children,
}: {
  to: "/admin" | "/";
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-brand-muted text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
