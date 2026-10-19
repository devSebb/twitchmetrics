"use client";

import { useState } from "react";
import type { Platform } from "@twitchmetrics/database";
import { CHART_PLATFORM_COLORS } from "@/components/charts/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatDuration, formatUtcDay } from "@/lib/utils/format";
import {
  COMBINED_PEAK_SUFFIX,
  CREATOR_STAT_PERIODS,
  creatorStatLabel,
  type CreatorStatPeriod,
} from "@/lib/constants/metric-labels";
import {
  CREATOR_STATS_INFO,
  withWindow,
  type MetricInfo,
} from "@/lib/constants/metric-info";
import { InfoTip } from "@/components/shared/InfoTip";
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
  info,
}: {
  label: string;
  value: string;
  platforms?: Platform[];
  info: MetricInfo;
}) {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      {/* The label wraps rather than truncates: with the "?" beside it,
          "Best-Platform Peak · 30d" no longer fits one line in a narrow tile. */}
      <div className="flex items-start gap-1.5">
        <span className="min-w-0 text-xs leading-4 text-[#949BA4]">
          {label}
          {platforms?.map((p) => (
            <span key={p} className="ml-1.5 inline-flex align-middle">
              <PlatformDot platform={p} />
            </span>
          ))}
        </span>
        <InfoTip info={info} className="ml-auto" />
      </div>
      {/* Bottom-aligned, so values line up across tiles whose labels wrap. */}
      <p className="mt-auto text-xl font-bold text-[#F2F3F5]">{value}</p>
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

  // Every tile's card names the exact days it covers.
  const range = streamingStats
    ? `${formatUtcDay(streamingStats.periodStart)} – ${formatUtcDay(streamingStats.periodEnd)}`
    : null;
  const info = (entry: MetricInfo) =>
    range ? withWindow(entry, range) : entry;

  // Each tile's dots name only the platforms that fed that metric.
  const streamingStatDefs: {
    label: string;
    value: string;
    platforms?: Platform[] | undefined;
    info: MetricInfo;
  }[] = [
    {
      label: creatorStatLabel("airtime", period),
      value:
        streamingStats?.airTimeSeconds != null
          ? formatDuration(streamingStats.airTimeSeconds)
          : "—",
      platforms: streamingStats?.airtimePlatforms,
      info: info(CREATOR_STATS_INFO.airtime),
    },
    {
      label: creatorStatLabel("avgAirtime", period),
      value:
        streamingStats?.avgAirTimeSeconds != null
          ? formatDuration(streamingStats.avgAirTimeSeconds)
          : "—",
      platforms: streamingStats?.airtimePlatforms,
      info: info(CREATOR_STATS_INFO.avgAirtime),
    },
    {
      // A combined estimate belongs to no platform, so it says so in words
      // where a single-platform reading shows that platform's icon.
      label: streamingStats?.peakCombined
        ? `${creatorStatLabel("peakViewers", period)} · ${COMBINED_PEAK_SUFFIX}`
        : creatorStatLabel("peakViewers", period),
      value:
        streamingStats?.peakViewers != null
          ? formatNumber(streamingStats.peakViewers)
          : "—",
      platforms: streamingStats?.peakPlatform
        ? [streamingStats.peakPlatform]
        : [],
      info: info(
        streamingStats?.peakCombined
          ? CREATOR_STATS_INFO.peakViewersCombined
          : CREATOR_STATS_INFO.peakViewers,
      ),
    },
    {
      label: creatorStatLabel("avgViewers", period),
      value:
        streamingStats?.avgViewers != null
          ? formatNumber(streamingStats.avgViewers)
          : "—",
      platforms: streamingStats?.viewerPlatforms,
      info: info(CREATOR_STATS_INFO.avgViewers),
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
      info: info(CREATOR_STATS_INFO.newFollowers),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Period selector header */}
      <div className="flex items-center justify-between">
        <PeriodSelector value={period} onChange={setPeriod} />
        {/* Both days inclusive; the newest complete day of data, not today. */}
        {range && (
          <span className="flex items-center gap-1 text-xs text-[#949BA4]">
            {range}
            <InfoTip info={CREATOR_STATS_INFO.period} />
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
            info={def.info}
          />
        ))}
      </div>
    </div>
  );
}
