"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type SortValue = "followers" | "viewership" | "peak" | "trending" | "recent";

const SORTS: { label: string; value: SortValue }[] = [
  { label: "Followers", value: "followers" },
  { label: "Viewership", value: "viewership" },
  { label: "Peak", value: "peak" },
  { label: "Trending", value: "trending" },
  { label: "Recent", value: "recent" },
];

const TIMEFRAME: Record<SortValue, string> = {
  followers: "Latest snapshots",
  viewership: "Avg viewers, last 7 days",
  peak: "Peak viewers, last 7 days",
  trending: "Last 7 days",
  recent: "Recently added",
};

function isSortValue(value: string | null): value is SortValue {
  return (
    value === "followers" ||
    value === "viewership" ||
    value === "peak" ||
    value === "trending" ||
    value === "recent"
  );
}

export function CreatorSortControls() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const param = searchParams.get("sort");
  const currentSort: SortValue = isSortValue(param) ? param : "followers";
  const status = TIMEFRAME[currentSort];

  function handleSelect(value: SortValue) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", value);
    params.delete("page");
    router.push(`/creators?${params.toString()}`);
  }

  return (
    <div className="flex flex-1 items-center justify-between gap-3">
      <div className="flex w-fit gap-1 rounded-md bg-[#1E1F22] p-0.5">
        {SORTS.map((s) => {
          const isActive = currentSort === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSelect(s.value)}
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
