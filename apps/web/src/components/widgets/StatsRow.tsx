"use client";

import { useState } from "react";
import type { Platform } from "@twitchmetrics/database";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatDuration, formatDate } from "@/lib/utils/format";
import { trpc } from "@/lib/trpc";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

// ----------------------------------------------------------------
// Platform dot indicator
// ----------------------------------------------------------------

function PlatformDot({ platform }: { platform: Platform }) {
  const color =
    CHART_PLATFORM_COLORS[platform] ?? PLATFORM_CONFIG[platform].color;
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color }}
    />
  );
}

// ----------------------------------------------------------------
// Period selector
// ----------------------------------------------------------------

const PERIODS = [
  { value: "30d" as const, label: "30D" },
  { value: "3m" as const, label: "3M" },
  { value: "6m" as const, label: "6M" },
  { value: "1y" as const, label: "1Y" },
];

type PeriodValue = (typeof PERIODS)[number]["value"];

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}) {
  return (
    <div className="flex gap-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === p.value
              ? "bg-[#5865F2] text-white"
              : "bg-[#2B2D31] text-[#949BA4] hover:text-[#F2F3F5]"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------
// Streaming stat card
// ----------------------------------------------------------------

function StreamingStatCard({
  label,
  value,
  platforms,
}: {
  label: string;
  value: string;
  platforms?: Platform[];
}) {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-xs text-[#949BA4]">{label}</span>
        {platforms?.map((p) => (
          <PlatformDot key={p} platform={p} />
        ))}
      </div>
      <p className="text-xl font-bold text-[#F2F3F5]">{value}</p>
    </div>
  );
}

// ----------------------------------------------------------------
// Main StatsRow component
// ----------------------------------------------------------------

type StatsRowProps = {
  profile: SerializedProfile;
};

export function StatsRow({ profile }: StatsRowProps) {
  const [period, setPeriod] = useState<PeriodValue>("30d");

  const platforms = profile.platformAccounts.map((a) => a.platform);

  const { data: streamingStats } = trpc.snapshot.getStreamingStats.useQuery(
    {
      creatorProfileId: profile.id,
      period,
    },
    { staleTime: 300_000 },
  );

  const twitchOnly: Platform[] = platforms.includes("twitch" as Platform)
    ? ["twitch" as Platform]
    : [];

  const streamingStatDefs = [
    {
      label: "Airtime",
      value:
        streamingStats?.airTimeSeconds != null
          ? formatDuration(streamingStats.airTimeSeconds)
          : "—",
      platforms: twitchOnly,
    },
    {
      label: "Avg Airtime",
      value:
        streamingStats?.avgAirTimeSeconds != null
          ? formatDuration(streamingStats.avgAirTimeSeconds)
          : "—",
      platforms: twitchOnly,
    },
    {
      label: "Peak Viewers",
      value:
        streamingStats?.peakViewers != null
          ? formatNumber(streamingStats.peakViewers)
          : "—",
      platforms: streamingStats?.platforms,
    },
    {
      label: "Avg Viewers",
      value:
        streamingStats?.avgViewers != null
          ? formatNumber(streamingStats.avgViewers)
          : "—",
      platforms: streamingStats?.platforms,
    },
    {
      label: "New Followers",
      value:
        streamingStats != null
          ? streamingStats.followersGain > 0
            ? `+${formatNumber(streamingStats.followersGain)}`
            : streamingStats.followersGain < 0
              ? `-${formatNumber(Math.abs(streamingStats.followersGain))}`
              : "0"
          : "—",
      platforms: streamingStats?.platforms,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Period selector header */}
      <div className="flex items-center justify-between">
        <PeriodSelector value={period} onChange={setPeriod} />
        {streamingStats && (
          <span className="text-xs text-[#949BA4]">
            {formatDate(streamingStats.periodStart)} –{" "}
            {formatDate(streamingStats.periodEnd)}
          </span>
        )}
      </div>

      {/* Streaming stats row */}
      <div className="flex flex-wrap gap-3">
        {streamingStatDefs.map((def) => (
          <StreamingStatCard
            key={def.label}
            label={def.label}
            value={def.value}
            {...(def.platforms ? { platforms: def.platforms } : {})}
          />
        ))}
      </div>
    </div>
  );
}
