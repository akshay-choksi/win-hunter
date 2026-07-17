import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "success" | "navy";
  className?: string;
};

export function StatCard({ label, value, hint, tone = "default", className }: StatCardProps) {
  return (
    <Card
      className={cn(
        "gap-0 p-4 shadow-sm",
        tone === "success" && "border-primary/20 bg-brand-muted/40",
        tone === "navy" && "border-transparent bg-navy text-navy-foreground",
        className,
      )}
    >
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-wider",
          tone === "navy" ? "text-navy-foreground/70" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-bold tracking-tight tabular-nums",
          tone === "success" && "text-success",
          tone === "navy" && "text-navy-foreground",
        )}
      >
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "mt-1 text-xs",
            tone === "navy" ? "text-navy-foreground/65" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}
    </Card>
  );
}
