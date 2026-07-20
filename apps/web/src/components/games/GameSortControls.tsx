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
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5 w-fit">
        {SORTS.map((s) => {
          const isActive = currentSort === s.value;
          return (
            <button
              key={s.value}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                params.set("sort", s.value);
                params.delete("page");
                router.push(`/browse?${params.toString()}`);
              }}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-[#949BA4]">
        <span>{status}</span>
      </div>
    </div>
  );
}
