"use client";

import React, { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toggleWatchlistAction } from "@/features/application/actions/watchlistActions";

interface WatchlistButtonProps {
  ipoId: string;
  initialIsWatched?: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "outline" | "ghost";
  showLabel?: boolean;
}

export function WatchlistButton({
  ipoId,
  initialIsWatched = false,
  size = "sm",
  variant = "outline",
  showLabel = true,
}: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(initialIsWatched);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    // Optimistic toggle
    setIsWatched(!isWatched);

    startTransition(async () => {
      const res = await toggleWatchlistAction(ipoId);
      if (res.success && res.isWatched !== undefined) {
        setIsWatched(res.isWatched);
      } else {
        // Revert on failure
        setIsWatched(isWatched);
      }
    });
  };

  return (
    <Button
      size={size}
      variant={variant}
      disabled={isPending}
      onClick={handleToggle}
      className={isWatched ? "text-amber-500 border-amber-500/30 bg-amber-500/10" : ""}
      leftIcon={
        <Star
          className={`w-3.5 h-3.5 ${
            isWatched ? "fill-amber-500 text-amber-500" : "text-[var(--text-muted)]"
          }`}
        />
      }
    >
      {showLabel && (isWatched ? "Watching" : "Watchlist")}
    </Button>
  );
}
