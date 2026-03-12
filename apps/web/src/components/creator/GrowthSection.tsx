"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FollowerGrowthChart } from "@/components/charts";
import type { Platform } from "@twitchmetrics/database";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { cn } from "@/lib/utils";

type GrowthSectionProps = {
  slug: string;
  platforms: Platform[];
  initialPlatform: Platform;
};

type SnapshotResponse = {
  data: { date: string; value: string }[];
  meta: {
    period: string;
    platform: string;
    metric: string;
    dataPoints: number;
  };
};

export function GrowthSection({
  slug,
  platforms,
  initialPlatform,
}: GrowthSectionProps) {
  const [platform, setPlatform] = useState<Platform>(initialPlatform);
  const [period, setPeriod] = useState("30d");

  const { data, isLoading } = useQuery<SnapshotResponse>({
    queryKey: ["creator-snapshots", slug, platform, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/creators/${slug}/snapshots?platform=${platform}&period=${period}&metric=followers`,
      );
      if (!res.ok) throw new Error("Failed to fetch snapshots");
      return res.json() as Promise<SnapshotResponse>;
    },
  });

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#F2F3F5]">Follower Growth</h2>
      </div>

      {/* Platform tabs */}
      <div className="mb-3 flex flex-wrap gap-1">
        {platforms.map((p) => {
          const config = PLATFORM_CONFIG[p];
          return (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                platform === p
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:bg-[#383A40] hover:text-[#DBDEE1]",
              )}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: config.color || "#949BA4" }}
              />
              {config.name}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
        <FollowerGrowthChart
          data={data?.data ?? []}
          platform={platform}
          period={period}
          onPeriodChange={setPeriod}
          loading={isLoading}
        />
      </div>
    </div>
  );
}
