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
    <div className="rounded-2xl border border-[#3F4147] bg-[#232428] p-4 sm:p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <div className="text-sm font-semibold text-[#F2F3F5]">
            Refine the channel list
          </div>
          <p className="text-sm text-[#949BA4]">
            Filter by primary platform and reorder the directory by scale,
            momentum, or recency.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#949BA4]">
              Platform
            </div>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value || "all"}
                  type="button"
                  onClick={() => updateParams("platform", p.value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    currentPlatform === p.value
                      ? "border-[#E32C19]/45 bg-[#E32C19]/12 text-[#F2F3F5]"
                      : "border-[#3F4147] bg-[#1E1F22] text-[#949BA4] hover:border-[#4E5058] hover:text-[#DBDEE1]",
                  )}
                >
                  {p.value ? (
                    <PlatformIcon platform={p.value} size="xs" />
                  ) : null}
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#949BA4]">
              Sort By
            </div>
            <div className="flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => updateParams("sort", s.value)}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-xs font-medium transition-colors",
                    currentSort === s.value
                      ? "border-[#E32C19]/45 bg-[#E32C19]/12 text-[#F2F3F5]"
                      : "border-[#3F4147] bg-[#1E1F22] text-[#949BA4] hover:border-[#4E5058] hover:text-[#DBDEE1]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
