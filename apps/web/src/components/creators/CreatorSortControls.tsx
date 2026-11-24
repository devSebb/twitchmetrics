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
    <div className="flex min-w-0 basis-full flex-wrap items-center justify-between gap-3 lg:flex-1">
      <div className="flex max-w-full flex-wrap gap-1 rounded-md bg-n-canvas p-0.5">
        {SORTS.map((s) => {
          const isActive = currentSort === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSelect(s.value)}
              aria-pressed={isActive}
              className={cn(
                "min-h-11 rounded px-3 py-2 text-sm font-medium transition-colors",
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
