"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { normalizeGameSort, type GameSort } from "@/lib/game-list";

const SORTS: { label: string; value: GameSort }[] = [
  { label: "Viewers", value: "viewers" },
  { label: "Channels", value: "channels" },
  { label: "Hours Watched", value: "hoursWatched" },
];

const TIMEFRAME: Record<GameSort, string> = {
  viewers: "Latest snapshots",
  channels: "Latest snapshots",
  hoursWatched: "Last 7 days",
};

export function GameSortControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = normalizeGameSort(searchParams.get("sort"));
  const status = TIMEFRAME[currentSort];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div
        role="group"
        aria-label="Sort categories"
        className="flex flex-wrap gap-1"
      >
        {SORTS.map((s) => {
          const isActive = currentSort === s.value;
          return (
            <button
              key={s.value}
              aria-pressed={isActive}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("sort", s.value);
                params.delete("page");
                router.push(`/browse?${params.toString()}`);
              }}
              className={cn(
                "min-h-11 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-n-surface text-n-ink"
                  : "text-n-slate hover:text-n-ink",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-n-slate">
        <span>{status}</span>
      </div>
    </div>
  );
}
