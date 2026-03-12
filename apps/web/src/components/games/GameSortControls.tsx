"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const SORTS = [
  { label: "Viewers", value: "viewers" },
  { label: "Channels", value: "channels" },
  { label: "Hours Watched", value: "hoursWatched" },
] as const;

export function GameSortControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") ?? "viewers";

  return (
    <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5 w-fit">
      {SORTS.map((s) => (
        <button
          key={s.value}
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("sort", s.value);
            params.delete("page");
            router.push(`/games?${params.toString()}`);
          }}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            currentSort === s.value
              ? "bg-[#383A40] text-[#F2F3F5]"
              : "text-[#949BA4] hover:text-[#DBDEE1]",
          )}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
