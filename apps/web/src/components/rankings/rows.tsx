import { PlatformIcon } from "@/components/shared";
import { sortByPlatformOrder } from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import {
  rankedColumn,
  type CategoryMetric,
  type CreatorColumnKey,
  type CreatorMetric,
} from "@/lib/rankings";
import type {
  CategoryRankingRow,
  CreatorRankingRow,
} from "@/server/services/rankings";
import { RankingAvatar } from "./RankingAvatar";
import type { RankingColumn, RankingTableRow } from "./RankingTable";

/**
 * Turns stored ranking rows into table rows. Every creator ranking has the
 * same six figures; the ranked one leads and the rest keep one order per
 * family (viewership or followers), so a column is always where a reader
 * last saw it.
 */

const CREATOR_COLUMN: Record<CreatorColumnKey, RankingColumn> = {
  hoursWatched: {
    key: "hoursWatched",
    label: "Hours watched",
    description: "Hours watched in the last 30 days",
  },
  avgViewers: {
    key: "avgViewers",
    label: "Avg viewers",
    description: "Average viewers while live, last 30 days",
  },
  peakViewers: {
    key: "peakViewers",
    label: "Peak viewers",
    description: "Highest viewer count in the last 30 days",
  },
  airtime: {
    key: "airtime",
    label: "Airtime",
    description: "Hours live in the last 30 days",
  },
  followers: { key: "followers", label: "Followers" },
  growth: {
    key: "growth",
    label: "30-day growth",
    description: "Followers gained or lost in the last 30 days",
  },
};

const VIEWERSHIP_ORDER: CreatorColumnKey[] = [
  "hoursWatched",
  "avgViewers",
  "peakViewers",
  "airtime",
  "followers",
  "growth",
];
const FOLLOWER_ORDER: CreatorColumnKey[] = [
  "followers",
  "growth",
  "hoursWatched",
  "avgViewers",
  "peakViewers",
  "airtime",
];

export function creatorColumns(metric: CreatorMetric): RankingColumn[] {
  const ranked = rankedColumn(metric);
  const order =
    metric === "most-followed" || metric === "fastest-growing"
      ? FOLLOWER_ORDER
      : VIEWERSHIP_ORDER;
  return [ranked, ...order.filter((key) => key !== ranked)].map(
    (key) => CREATOR_COLUMN[key],
  );
}

function figure(value: number | null | undefined) {
  return value == null ? null : formatNumber(value);
}

export function formatHours(minutes: number | null | undefined) {
  return minutes == null ? null : formatNumber(Math.round(minutes / 60));
}

export function formatGain(delta: number): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(delta))}`;
}

function Growth({ delta, pct }: { delta: number; pct: number | null }) {
  const tone =
    delta > 0 ? "text-n-success" : delta < 0 ? "text-n-red" : "text-n-slate";
  return (
    <span className="block leading-tight">
      <span className={tone}>{formatGain(delta)}</span>
      {pct != null && (
        <span className="block text-xs font-normal text-n-slate">
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

export function creatorTableRows(
  rows: CreatorRankingRow[],
  opts: { avatarSize?: "sm" | "md"; showKnownFor?: boolean } = {},
): RankingTableRow[] {
  const { avatarSize = "md", showKnownFor = true } = opts;
  return rows.map((row) => {
    const { stats, creator } = row;
    const platforms = sortByPlatformOrder(
      creator.platforms.map((platform) => ({ platform })),
    );
    return {
      rank: row.rank,
      movement: row.movement,
      href: `/creator/${creator.slug}`,
      name: creator.displayName,
      lead: (
        <RankingAvatar
          src={creator.avatarUrl}
          name={creator.displayName}
          size={avatarSize}
        />
      ),
      detail: (
        <>
          <span className="flex shrink-0 items-center gap-1">
            {platforms.map(({ platform }) => (
              <PlatformIcon
                key={platform}
                platform={platform}
                size="xs"
                className="h-3.5 w-3.5"
              />
            ))}
          </span>
          {showKnownFor && creator.primaryGameName && (
            <span className="hidden truncate sm:inline">
              Known for {creator.primaryGameName}
            </span>
          )}
        </>
      ),
      cells: {
        hoursWatched: formatHours(stats.minutesWatched),
        avgViewers: figure(stats.avgViewers),
        peakViewers: figure(stats.peakViewers),
        airtime:
          stats.airtimeMinutes == null
            ? null
            : `${formatHours(stats.airtimeMinutes)}h`,
        followers: figure(stats.followers),
        growth:
          stats.followerDelta30d == null ? null : (
            <Growth delta={stats.followerDelta30d} pct={stats.followerPct30d} />
          ),
      },
    };
  });
}

const CATEGORY_COLUMN: Record<string, RankingColumn> = {
  hoursWatched: {
    key: "hoursWatched",
    label: "Hours watched",
    description: "Hours watched in the last 30 days, every platform",
  },
  hoursStreamed: {
    key: "hoursStreamed",
    label: "Hours streamed",
    description: "Hours of streams in the last 30 days, every platform",
  },
  avgViewers: {
    key: "avgViewers",
    label: "Avg viewers",
    description: "Average viewers at any moment in the last 30 days",
  },
  avgChannels: {
    key: "avgChannels",
    label: "Channels a day",
    description: "Channels streaming it on an average day",
  },
};

export function categoryRankedKey(metric: CategoryMetric): string {
  return metric === "most-watched" ? "hoursWatched" : "hoursStreamed";
}

export function categoryColumns(metric: CategoryMetric): RankingColumn[] {
  const ranked = categoryRankedKey(metric);
  const order = ["hoursWatched", "avgViewers", "hoursStreamed", "avgChannels"];
  return [ranked, ...order.filter((key) => key !== ranked)].map(
    (key) => CATEGORY_COLUMN[key] as RankingColumn,
  );
}

export function categoryTableRows(
  rows: CategoryRankingRow[],
  opts: { avatarSize?: "sm" | "md" } = {},
): RankingTableRow[] {
  return rows.map((row) => ({
    rank: row.rank,
    movement: row.movement,
    href: `/game/${row.game.slug}`,
    name: row.game.name,
    lead: (
      <RankingAvatar
        src={row.game.coverImageUrl}
        name={row.game.name}
        shape="cover"
        size={opts.avatarSize ?? "md"}
      />
    ),
    cells: {
      hoursWatched: formatHours(row.stats.minutesWatched),
      hoursStreamed: formatHours(row.stats.airtimeMinutes),
      avgViewers: figure(row.stats.avgViewers),
      avgChannels: figure(row.stats.avgChannels),
    },
  }));
}
