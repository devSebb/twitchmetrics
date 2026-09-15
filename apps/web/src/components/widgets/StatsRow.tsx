"use client";

import { useState } from "react";
import type { Platform } from "@twitchmetrics/database";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatDuration, formatDate } from "@/lib/utils/format";
import {
  CREATOR_PEAK_VIEWERS_TOOLTIP,
  CREATOR_STAT_PERIODS,
  creatorStatLabel,
  type CreatorStatPeriod,
} from "@/lib/constants/metric-labels";
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

type PeriodValue = CreatorStatPeriod;

function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
}) {
  return (
    <div className="flex gap-1">
      {CREATOR_STAT_PERIODS.map((p) => (
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
  tooltip,
}: {
  label: string;
  value: string;
  platforms?: Platform[];
  tooltip?: string;
}) {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      <div className="flex items-center gap-1.5" title={tooltip ?? label}>
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

  const { data: streamingStats } = trpc.snapshot.getStreamingStats.useQuery(
    {
      creatorProfileId: profile.id,
      period,
    },
    { staleTime: 300_000 },
  );

  // Each tile's dots name only the platforms that fed that metric.
  const streamingStatDefs: {
    label: string;
    value: string;
    platforms?: Platform[] | undefined;
    tooltip?: string;
  }[] = [
    {
      label: creatorStatLabel("airtime", period),
      value:
        streamingStats?.airTimeSeconds != null
          ? formatDuration(streamingStats.airTimeSeconds)
          : "—",
      platforms: streamingStats?.airtimePlatforms,
    },
    {
      label: creatorStatLabel("avgAirtime", period),
      value:
        streamingStats?.avgAirTimeSeconds != null
          ? formatDuration(streamingStats.avgAirTimeSeconds)
          : "—",
      platforms: streamingStats?.airtimePlatforms,
    },
    {
      label: creatorStatLabel("peakViewers", period),
      value:
        streamingStats?.peakViewers != null
          ? formatNumber(streamingStats.peakViewers)
          : "—",
      platforms: streamingStats?.peakPlatform
        ? [streamingStats.peakPlatform]
        : [],
      tooltip: CREATOR_PEAK_VIEWERS_TOOLTIP,
    },
    {
      label: creatorStatLabel("avgViewers", period),
      value:
        streamingStats?.avgViewers != null
          ? formatNumber(streamingStats.avgViewers)
          : "—",
      platforms: streamingStats?.viewerPlatforms,
    },
    {
      label: creatorStatLabel("newFollowers", period),
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
            {...(def.tooltip ? { tooltip: def.tooltip } : {})}
          />
        ))}
      </div>
    </div>
  );
}
