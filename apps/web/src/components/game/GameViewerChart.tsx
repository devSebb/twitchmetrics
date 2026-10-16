"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChartLine } from "@phosphor-icons/react/dist/ssr";
import { ViewerCountChart } from "@/components/charts/ViewerCountChart";
import { cn } from "@/lib/utils";

type SnapshotPoint = {
  date: string;
  totalViewers: number;
};

type ViewerSummary = { average: number; peak: number };

type GameViewerChartProps = {
  slug: string;
  /** The page's newest snapshot: every period ends here, like the header. */
  until: string | null;
  /** The 7d window the header was derived from. */
  initialData: SnapshotPoint[];
  initialSummary: ViewerSummary;
};

const PERIODS = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

export function GameViewerChart({
  slug,
  until,
  initialData,
  initialSummary,
}: GameViewerChartProps) {
  // 7d first: it is the header's window, so the avg line and the header's
  // "Avg Viewers · 7d" print the same number. (The default used to be a "30d"
  // tab seeded with the page's last 100 snapshots — about two days.)
  const [period, setPeriod] = useState<Period>("7d");

  const { data, isLoading } = useQuery({
    queryKey: ["game-snapshots", slug, period, until],
    queryFn: async () => {
      const params = new URLSearchParams({ period, metric: "viewers" });
      if (until) params.set("until", until);
      const res = await fetch(`/api/games/${slug}/snapshots?${params}`);
      const json = (await res.json()) as {
        data: { date: string; value: number }[];
        meta: { viewers?: ViewerSummary };
      };
      return {
        points: json.data.map((d) => ({ date: d.date, viewers: d.value })),
        summary: json.meta.viewers ?? null,
      };
    },
    initialData:
      period === "7d"
        ? {
            points: initialData.map((d) => ({
              date: d.date,
              viewers: d.totalViewers,
            })),
            summary: initialSummary,
          }
        : undefined,
    staleTime: 60_000,
  });

  const chartData = data?.points ?? [];
  const summary = useMemo(
    () =>
      data?.summary ? { ...data.summary, windowLabel: period } : undefined,
    [data?.summary, period],
  );

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[#F2F3F5]">
          <ChartLine size={20} weight="duotone" className="text-[#949BA4]" />
          Twitch Viewership History
        </h2>
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
          valueLabel="viewers"
          summary={summary}
        />
      </div>
    </div>
  );
}
