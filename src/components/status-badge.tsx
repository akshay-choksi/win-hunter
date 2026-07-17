import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "default" | "live" | "locked" | "open" | "muted";
  className?: string;
};

const toneClass: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  default: "border-transparent bg-secondary text-secondary-foreground",
  live: "border-transparent bg-success/15 text-success",
  locked: "border-transparent bg-navy/10 text-navy",
  open: "border-transparent bg-primary/15 text-primary",
  muted: "border-transparent bg-muted text-muted-foreground",
};

export function StatusBadge({ children, tone = "default", className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-0.5 font-medium shadow-none",
        toneClass[tone],
        className,
      )}
    >
      {children}
    </Badge>
  );
}
