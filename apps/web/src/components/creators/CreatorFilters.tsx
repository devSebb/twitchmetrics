"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Platform } from "@twitchmetrics/database";
import { PlatformIcon } from "@/components/shared";

const PLATFORMS: Array<
  { label: string; value: "" } | { label: string; value: Platform }
> = [
  { label: "All", value: "" },
  { label: "Twitch", value: "twitch" },
  { label: "YouTube", value: "youtube" },
  { label: "Instagram", value: "instagram" },
  { label: "TikTok", value: "tiktok" },
  { label: "X", value: "x" },
  { label: "Kick", value: "kick" },
];

const SORTS = [
  { label: "Followers", value: "followers" },
  { label: "Trending", value: "trending" },
  { label: "Recent", value: "recent" },
] as const;

export function CreatorFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPlatform = searchParams.get("platform") ?? "";
  const currentSort = searchParams.get("sort") ?? "followers";

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    const next = params.toString();
    router.push(next ? `/creators?${next}` : "/creators");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#949BA4]">
          Sort By
        </div>
        <div className="w-fit rounded-md bg-[#1E1F22] p-0.5">
          <div className="flex gap-1">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => updateParams("sort", s.value)}
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
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#949BA4]">
          Platform
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {PLATFORMS.map((p) => (
            <button
              key={p.value || "all"}
              type="button"
              onClick={() => updateParams("platform", p.value)}
              className={cn(
                "flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                currentPlatform === p.value
                  ? "bg-[#E32C19] text-white"
                  : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              {p.value ? <PlatformIcon platform={p.value} size="xs" /> : null}
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
