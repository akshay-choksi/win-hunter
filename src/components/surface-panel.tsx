import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SurfacePanelProps = {
  title?: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: "default" | "navy";
};

export function SurfacePanel({
  title,
  icon,
  meta,
  children,
  className,
  bodyClassName,
  tone = "default",
}: SurfacePanelProps) {
  const hasHeader = title != null || icon != null || meta != null;

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 shadow-sm",
        tone === "navy" && "border-transparent bg-navy text-navy-foreground",
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b px-5 py-3",
            tone === "navy" ? "border-white/10 bg-white/5" : "border-border/80 bg-muted/40",
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className={cn("shrink-0", tone === "navy" ? "text-success" : "text-primary")}>
                {icon}
              </span>
            ) : null}
            {title ? (
              <h2
                className={cn(
                  "truncate font-semibold",
                  tone === "navy" ? "text-navy-foreground" : "text-foreground",
                )}
              >
                {title}
              </h2>
            ) : null}
          </div>
          {meta ? (
            <div
              className={cn(
                "shrink-0 text-xs",
                tone === "navy" ? "text-navy-foreground/70" : "text-muted-foreground",
              )}
            >
              {meta}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </Card>
  );
}
