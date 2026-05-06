"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const SORTS = [
  { label: "Viewers", value: "viewers", timeframe: "Live" },
  { label: "Channels", value: "channels", timeframe: "Live" },
  { label: "Hours Watched", value: "hoursWatched", timeframe: "Last 7 days" },
] as const;

export function GameSortControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") ?? "viewers";

  return (
    <div className="flex gap-1 rounded-md bg-[#1E1F22] p-1 w-fit">
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
              "flex flex-col items-start rounded px-3 py-1.5 text-left transition-colors",
              isActive
                ? "bg-[#383A40] text-[#F2F3F5]"
                : "text-[#949BA4] hover:text-[#DBDEE1]",
            )}
          >
            <span className="text-xs font-medium leading-tight">{s.label}</span>
            <span
              className={cn(
                "text-[10px] leading-tight",
                isActive ? "text-[#949BA4]" : "text-[#6D7079]",
              )}
            >
              {s.timeframe}
            </span>
          </button>
        );
      })}
    </div>
  );
}
