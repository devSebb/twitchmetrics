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
import { DEFAULT_STAT_PERIOD, type StatsContext } from "@/lib/stats-period";
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
  note,
  platforms,
  info,
}: {
  label: string;
  value: string;
  /** A qualifier under the value, e.g. "since Apr 22, 2026". */
  note?: string | undefined;
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
      {/* The note shares the value's baseline, so values still line up. */}
      <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xl font-bold text-[#F2F3F5]">{value}</span>
        {note && <span className="text-xs text-[#949BA4]">{note}</span>}
      </p>
    </div>
  );
}

/** Same footprint as a StreamingStatCard, while the period loads. */
function StatCardSkeleton() {
  return (
    <div className="flex min-w-[140px] flex-1 flex-col gap-2 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      <div className="h-3.5 w-20 animate-pulse rounded bg-[#383A40]" />
      <div className="mt-auto h-6 w-16 animate-pulse rounded bg-[#383A40]" />
    </div>
  );
}

/**
 * Stands in for the four streaming tiles when the period has no stream at
 * all: one statement instead of four dashes.
 */
function NoStreamsCard({ detail }: { detail: string | null }) {
  return (
    <div className="flex min-w-[140px] flex-[4] flex-col justify-center gap-1 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      <p className="text-sm font-semibold text-[#F2F3F5]">
        No streams in this period
      </p>
      {detail && <p className="text-xs text-[#949BA4]">{detail}</p>}
    </div>
  );
}

function periodLabel(period: PeriodValue): string {
  return CREATOR_STAT_PERIODS.find((p) => p.value === period)?.label ?? period;
}

// ----------------------------------------------------------------
// Main StatsRow component
// ----------------------------------------------------------------

type StatsRowProps = {
  profile: SerializedProfile;
  /** Server-picked opening period and last stream day (lib/stats-period). */
  statsContext?: StatsContext | undefined;
};

export function StatsRow({ profile, statsContext }: StatsRowProps) {
  const initialPeriod = statsContext?.initialPeriod ?? DEFAULT_STAT_PERIOD;
  const [period, setPeriod] = useState<PeriodValue>(initialPeriod);
  // The "showing 3M" note explains the server's choice; once the viewer
  // picks a period themselves it has nothing left to explain.
  const [periodChosen, setPeriodChosen] = useState(false);
  const choosePeriod = (value: PeriodValue) => {
    setPeriodChosen(true);
    setPeriod(value);
  };

  const { data: streamingStats, isLoading } =
    trpc.snapshot.getStreamingStats.useQuery(
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
  ];

  // Null when the period can't be measured (computeFollowerGain): "—",
  // never a made-up 0.
  const gain = streamingStats?.followersGain ?? null;
  // A 6M / 1Y gain that starts when tracking did, not when the period did.
  const followersSince = streamingStats?.followersSince ?? null;
  const newFollowersInfo =
    followersSince && streamingStats
      ? withWindow(
          {
            ...CREATOR_STATS_INFO.newFollowers,
            body: `${CREATOR_STATS_INFO.newFollowers.body} We started tracking this creator's followers after the period began, so this covers ${formatUtcDay(followersSince)} onward, not the whole period.`,
          },
          `${formatUtcDay(followersSince)} – ${formatUtcDay(streamingStats.periodEnd)}`,
        )
      : info(CREATOR_STATS_INFO.newFollowers);
  const newFollowersDef = {
    label: creatorStatLabel("newFollowers", period),
    value:
      gain == null
        ? "—"
        : gain > 0
          ? `+${formatNumber(gain)}`
          : gain < 0
            ? `-${formatNumber(Math.abs(gain))}`
            : "0",
    note:
      gain != null && followersSince
        ? `since ${formatUtcDay(followersSince)}`
        : undefined,
    platforms: streamingStats?.followerPlatforms,
    info: newFollowersInfo,
  };

  const noStreams =
    streamingStats != null &&
    streamingStats.airTimeSeconds == null &&
    streamingStats.avgAirTimeSeconds == null &&
    streamingStats.peakViewers == null &&
    streamingStats.avgViewers == null;

  // "Last streamed" only for a stream before this period. With no rollup
  // history, "none recorded" is only safe without Twitch: VOD-only airtime
  // isn't in the rollups.
  const lastStreamDay = statsContext?.lastStreamDay ?? null;
  const noStreamsDetail =
    lastStreamDay &&
    streamingStats &&
    lastStreamDay < streamingStats.periodStart
      ? `Last streamed ${formatUtcDay(lastStreamDay)}`
      : statsContext &&
          !lastStreamDay &&
          !profile.platformAccounts.some((a) => a.platform === "twitch")
        ? "No streams recorded yet"
        : null;

  const autoNote =
    !periodChosen && initialPeriod !== DEFAULT_STAT_PERIOD
      ? `No streams in the last 30 days · showing ${periodLabel(initialPeriod)}`
      : null;

  return (
    <div className="space-y-3">
      {/* Period selector header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodSelector value={period} onChange={choosePeriod} />
        {/* Both days inclusive; the newest complete day of data, not today. */}
        {range && (
          <span className="flex items-center gap-1 text-xs text-[#949BA4]">
            {range}
            <InfoTip info={CREATOR_STATS_INFO.period} />
          </span>
        )}
      </div>

      {autoNote && <p className="text-xs text-[#949BA4]">{autoNote}</p>}

      {/* Streaming stats row */}
      <div className="flex flex-wrap gap-3">
        {isLoading ? (
          Array.from({ length: 5 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            {noStreams ? (
              <NoStreamsCard detail={noStreamsDetail} />
            ) : (
              streamingStatDefs.map((def) => (
                <StreamingStatCard
                  key={def.label}
                  label={def.label}
                  value={def.value}
                  {...(def.platforms ? { platforms: def.platforms } : {})}
                  info={def.info}
                />
              ))
            )}
            <StreamingStatCard
              label={newFollowersDef.label}
              value={newFollowersDef.value}
              note={newFollowersDef.note}
              {...(newFollowersDef.platforms
                ? { platforms: newFollowersDef.platforms }
                : {})}
              info={newFollowersDef.info}
            />
          </>
        )}
      </div>
    </div>
  );
}
