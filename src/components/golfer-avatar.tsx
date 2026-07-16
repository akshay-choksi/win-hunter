import { useState } from "react";
import { golferHeadshotUrl } from "@/lib/scoring";
import { cn } from "@/lib/utils";

type GolferAvatarProps = {
  name: string;
  pgaPlayerNum?: string | null;
  className?: string;
  size?: "sm" | "md";
};

export function GolferAvatar({ name, pgaPlayerNum, className, size = "sm" }: GolferAvatarProps) {
  const url = golferHeadshotUrl(pgaPlayerNum);
  const [failed, setFailed] = useState(false);
  const dim = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const initial = name.trim().charAt(0).toUpperCase() || "G";

  if (!url || failed) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded bg-slate-100 text-xs font-bold text-slate-600",
          dim,
          className,
        )}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("shrink-0 rounded object-cover", dim, className)}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
}
