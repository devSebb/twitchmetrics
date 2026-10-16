import type { Prisma } from "@twitchmetrics/database";

const MINUTE_MS = 60 * 1000;

/**
 * How long a GameTopChannel row may be shown as "live now", per writer.
 *
 * Every card on the game page says "viewers now", so a row is only shown while
 * its writer would still be refreshing it. Before this (QA, 2026-10) League of
 * Legends listed Jynxzi and ohnePixel first with counts from 2026-05-18, rows of
 * a retired writer (source "api") that nothing deletes, and Stream Hatchet live
 * rows that the 5-games-an-hour rotation leaves in place for a day or more.
 *
 * - twitch_api: game-snapshot, every 30 min — two missed runs and it's gone.
 * - kick_api: kick-category-snapshot, hourly.
 * - streamhatchet_live: live-channels, hourly, but each game only every ~20 h,
 *   so in practice a game shows them for the hour after its turn.
 * Any other source is never shown.
 */
export const TOP_CHANNEL_MAX_AGE_MS: Readonly<Record<string, number>> = {
  twitch_api: 75 * MINUTE_MS,
  kick_api: 2 * 60 * MINUTE_MS,
  streamhatchet_live: 2 * 60 * MINUTE_MS,
};

/** Prisma filter for rows still live at `now`; see TOP_CHANNEL_MAX_AGE_MS. */
export function liveTopChannelWhere(
  now: Date = new Date(),
): Prisma.GameTopChannelWhereInput {
  return {
    OR: Object.entries(TOP_CHANNEL_MAX_AGE_MS).map(([source, maxAgeMs]) => ({
      source,
      updatedAt: { gte: new Date(now.getTime() - maxAgeMs) },
    })),
  };
}

type TopChannelLike = {
  platform?: string | null;
  source?: string | null;
  channelName: string;
  category: string;
  avgViewers: number;
  updatedAt?: Date | string | null;
};

/** Same rule as liveTopChannelWhere, for rows already loaded. */
export function isTopChannelLive(
  channel: Pick<TopChannelLike, "source" | "updatedAt">,
  now: Date = new Date(),
): boolean {
  const maxAgeMs = channel.source
    ? TOP_CHANNEL_MAX_AGE_MS[channel.source]
    : undefined;
  if (maxAgeMs === undefined || !channel.updatedAt) return false;
  const age = now.getTime() - new Date(channel.updatedAt).getTime();
  return age >= 0 && age <= maxAgeMs;
}

function topChannelSourcePriority(source: string | null | undefined): number {
  switch (source) {
    case "twitch_api":
    case "kick_api":
      return 100;
    case "streamhatchet_live":
      return 80;
    default:
      return 10;
  }
}

/**
 * The two cards on the game page: six Most Watched, five Emerging, each sorted
 * by viewers now. Stale rows are dropped first; one row per channel per
 * platform, the platform's own API beating Stream Hatchet's live feed.
 */
export function selectDisplayTopChannels<T extends TopChannelLike>(
  channels: T[],
  now: Date = new Date(),
): T[] {
  const byChannel = new Map<string, T>();

  for (const channel of channels) {
    if (!isTopChannelLive(channel, now)) continue;
    const key = `${channel.platform ?? "unknown"}:${channel.channelName.toLowerCase()}`;
    const existing = byChannel.get(key);
    const shouldReplace =
      !existing ||
      topChannelSourcePriority(channel.source) >
        topChannelSourcePriority(existing.source) ||
      (topChannelSourcePriority(channel.source) ===
        topChannelSourcePriority(existing.source) &&
        channel.avgViewers > existing.avgViewers);

    if (shouldReplace) byChannel.set(key, channel);
  }

  const deduped = [...byChannel.values()];
  const mostWatched = deduped
    .filter((channel) => channel.category === "most_watched")
    .sort((left, right) => right.avgViewers - left.avgViewers)
    .slice(0, 6);
  const emerging = deduped
    .filter(
      (channel) =>
        channel.category === "emerging" ||
        channel.category === "fastest_growing",
    )
    .sort((left, right) => right.avgViewers - left.avgViewers)
    .slice(0, 5);

  return [...mostWatched, ...emerging];
}
