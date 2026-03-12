"use client";

import { useMemo } from "react";
import type { Platform } from "@twitchmetrics/database";
import { Sparkline } from "@/components/charts";
import {
  CHART_PLATFORM_COLORS,
  CHART_TREND_COLORS,
} from "@/components/charts/theme";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { trpc } from "@/lib/trpc";
import type {
  SerializedProfile,
  SerializedGrowthRollup,
} from "@/components/dashboard/DashboardGrid";

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

type StatCardDef = {
  key: string;
  label: string;
  getValue: (profile: SerializedProfile) => number | null;
  platform?: Platform;
};

// ----------------------------------------------------------------
// Card configuration — data-driven
// ----------------------------------------------------------------

const STAT_CARDS: StatCardDef[] = [
  {
    key: "total_followers",
    label: "Total Followers",
    getValue: (p) => (p.totalFollowers ? Number(p.totalFollowers) : null),
  },
  {
    key: "total_views",
    label: "Total Views",
    getValue: (p) => (p.totalViews ? Number(p.totalViews) : null),
  },
];

/** Build per-platform cards dynamically from connected accounts */
function buildPlatformCards(profile: SerializedProfile): StatCardDef[] {
  return profile.platformAccounts.map((acct) => ({
    key: `${acct.platform}_followers`,
    label: `${PLATFORM_CONFIG[acct.platform].name} Followers`,
    getValue: () =>
      acct.followerCount !== null ? Number(acct.followerCount) : null,
    platform: acct.platform,
  }));
}

// ----------------------------------------------------------------
// Delta badge helper
// ----------------------------------------------------------------

function getRollupForPlatform(
  rollups: SerializedGrowthRollup[],
  platform?: Platform,
): SerializedGrowthRollup | undefined {
  if (!platform) return undefined;
  return rollups.find((r) => r.platform === platform);
}

function TrendBadge({
  pct7d,
  trendDirection,
}: {
  pct7d: number | null;
  trendDirection: string | null;
}) {
  if (pct7d === null || pct7d === undefined) return null;

  const dir =
    trendDirection === "UP"
      ? "up"
      : trendDirection === "DOWN"
        ? "down"
        : "flat";
  const color = CHART_TREND_COLORS[dir];
  const arrow = dir === "up" ? "▲" : dir === "down" ? "▼" : "—";

  return (
    <span
      className="flex items-center gap-0.5 text-xs font-medium"
      style={{ color }}
    >
      <span className="text-[10px]">{arrow}</span>
      {formatPercent(pct7d)}
    </span>
  );
}

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
// Single stat card
// ----------------------------------------------------------------

function StatCard({
  def,
  profile,
  sparklineData,
  trendDir,
}: {
  def: StatCardDef;
  profile: SerializedProfile;
  sparklineData: number[];
  trendDir: "up" | "down" | "flat";
}) {
  const value = def.getValue(profile);
  const rollup = getRollupForPlatform(profile.growthRollups, def.platform);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-[#3F4147] bg-[#2B2D31] px-4 py-3">
      <div className="flex items-center gap-1.5">
        {def.platform && <PlatformDot platform={def.platform} />}
        <span className="truncate text-xs text-[#949BA4]">{def.label}</span>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xl font-bold text-[#F2F3F5]">
            {value !== null ? formatNumber(value) : "—"}
          </p>
          {rollup && (
            <TrendBadge
              pct7d={rollup.pct7d}
              trendDirection={rollup.trendDirection}
            />
          )}
        </div>

        <Sparkline
          data={sparklineData}
          trend={trendDir}
          width={80}
          height={32}
        />
      </div>
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
  const cards = useMemo(() => {
    const platformCards = buildPlatformCards(profile);
    return [...STAT_CARDS, ...platformCards];
  }, [profile]);

  // Fetch last 30 snapshots for sparklines — one query per connected platform
  const platforms = useMemo(
    () => profile.platformAccounts.map((a) => a.platform),
    [profile.platformAccounts],
  );

  const primaryPlatform = platforms[0] ?? "twitch";

  const { data: snapshotData } = trpc.snapshot.getGrowthData.useQuery(
    {
      creatorProfileId: profile.id,
      platform: primaryPlatform,
      period: "30d",
    },
    { enabled: platforms.length > 0 },
  );

  // Build sparkline data from snapshots
  const sparklineMap = useMemo(() => {
    const map: Record<string, number[]> = {};

    if (snapshotData) {
      // Followers sparkline from primary platform
      const followerPoints = snapshotData
        .map((s) => (s.followerCount ? Number(s.followerCount) : null))
        .filter((v): v is number => v !== null);
      map[`${primaryPlatform}_followers`] = followerPoints.slice(-14);
      map["total_followers"] = followerPoints.slice(-14);

      // Views sparkline
      const viewPoints = snapshotData
        .map((s) => (s.totalViews ? Number(s.totalViews) : null))
        .filter((v): v is number => v !== null);
      map["total_views"] = viewPoints.slice(-14);
    }

    return map;
  }, [snapshotData, primaryPlatform]);

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((def) => {
        const rollup = getRollupForPlatform(
          profile.growthRollups,
          def.platform,
        );
        const trendDir: "up" | "down" | "flat" =
          rollup?.trendDirection === "UP"
            ? "up"
            : rollup?.trendDirection === "DOWN"
              ? "down"
              : "flat";

        return (
          <StatCard
            key={def.key}
            def={def}
            profile={profile}
            sparklineData={sparklineMap[def.key] ?? []}
            trendDir={trendDir}
          />
        );
      })}
    </div>
  );
}
