"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ViewerCountChart } from "@/components/charts/ViewerCountChart";
import { cn } from "@/lib/utils";

type SnapshotPoint = {
  date: string;
  totalViewers: number;
  twitchViewers: number;
  youtubeViewers: number;
};

type GameViewerChartProps = {
  slug: string;
  initialData: SnapshotPoint[];
};

const PERIODS = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

export function GameViewerChart({ slug, initialData }: GameViewerChartProps) {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ["game-snapshots", slug, period],
    queryFn: async () => {
      const res = await fetch(
        `/api/games/${slug}/snapshots?period=${period}&metric=viewers`,
      );
      const json = (await res.json()) as {
        data: { date: string; value: number }[];
      };
      return json.data.map((d) => ({
        date: d.date,
        viewers: d.value,
      }));
    },
    initialData:
      period === "30d"
        ? initialData.map((d) => ({ date: d.date, viewers: d.totalViewers }))
        : undefined,
    staleTime: 60_000,
  });

  const chartData = snapshots ?? [];

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#F2F3F5]">Viewership History</h2>
        <div className="flex gap-1 rounded-md bg-[#1E1F22] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
        <ViewerCountChart
          data={chartData}
          platform="twitch"
          loading={isLoading}
          height={350}
        />
      </div>
    </div>
  );
}
