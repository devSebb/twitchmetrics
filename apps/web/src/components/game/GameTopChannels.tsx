import Image from "next/image";
import Link from "next/link";
import type { Platform } from "@twitchmetrics/database";
import { formatNumber, formatUtcDay } from "@/lib/utils/format";
import { InfoTip, PlatformIcon, SyncStatus } from "@/components/shared";
import { GAME_INFO, withWindow } from "@/lib/constants/metric-info";
import type {
  GameMostWatched,
  MostWatchedChannel,
} from "@/server/services/game-most-watched";

type TopChannel = {
  id: string;
  platform?: Platform | null;
  channelName: string;
  avatarUrl: string | null;
  slug: string | null;
  streamTitle?: string | null;
  category: string;
  /** Viewers at snapshot time (not an average, despite the column name). */
  avgViewers: number;
  airtime: number; // seconds live at snapshot time
  updatedAt?: string | Date | null;
};

type GameTopChannelsProps = {
  /** Live rows; only the Emerging card uses them. */
  channels: TopChannel[];
  /** Null when the ranking couldn't be loaded. */
  mostWatched: GameMostWatched | null;
};

export function ChannelAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-n-surface">
        <Image
          src={avatarUrl}
          alt={name}
          fill
          sizes="32px"
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }
  return (
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-n-surface text-xs font-bold text-n-slate">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// Each card is sorted by the number its rows show (here: viewers now), so
// every list reads monotonically (QA: a 39.2K row above a 1.6M row when one
// card showed viewer-hours but sorted by viewers).
function ChannelRow({ channel }: { channel: TopChannel }) {
  const inner = (
    <div className="flex items-center gap-3 border-b border-n-line py-4 transition-colors hover:bg-n-surface">
      <ChannelAvatar name={channel.channelName} avatarUrl={channel.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-n-ink">
          {channel.channelName}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-n-slate">
          {channel.platform && (
            <PlatformIcon platform={channel.platform} size="xs" rounded="lg" />
          )}
          <span className="min-w-0 leading-relaxed">
            {formatNumber(channel.avgViewers)} viewers now
            {channel.airtime > 0 && (
              <>
                {" "}
                &middot; live {Math.max(1, Math.round(channel.airtime / 3600))}h
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );

  if (channel.slug) {
    return (
      <Link key={channel.id} href={`/creator/${channel.slug}`}>
        {inner}
      </Link>
    );
  }
  return inner;
}

// Hours watched on this game over the card's 7 days, the number it's sorted by.
function MostWatchedRow({ channel }: { channel: MostWatchedChannel }) {
  const inner = (
    <div className="flex items-center gap-3 border-b border-n-line py-4 transition-colors hover:bg-n-surface">
      <ChannelAvatar name={channel.name} avatarUrl={channel.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-n-ink">
          {channel.name}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-n-slate">
          <PlatformIcon platform={channel.platform} size="xs" rounded="lg" />
          <span className="min-w-0 leading-relaxed">
            {formatNumber(channel.hoursWatched)} hours watched
            {channel.airtimeMinutes > 0 && (
              <>
                {" "}
                &middot; {Math.max(1, Math.round(channel.airtimeMinutes / 60))}h
                streamed
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );

  if (channel.slug) {
    return <Link href={`/creator/${channel.slug}`}>{inner}</Link>;
  }
  return inner;
}

function latestUpdate(channels: TopChannel[]): string | null {
  let latest: number | null = null;
  for (const channel of channels) {
    if (!channel.updatedAt) continue;
    const time = new Date(channel.updatedAt).getTime();
    if (Number.isFinite(time) && (latest === null || time > latest)) {
      latest = time;
    }
  }
  return latest === null ? null : new Date(latest).toISOString();
}

export function GameTopChannels({
  channels,
  mostWatched,
}: GameTopChannelsProps) {
  // Callers pass emerging already sorted by viewers now (desc).
  const emerging = channels.filter(
    (c) => c.category === "emerging" || c.category === "fastest_growing",
  );
  const mostWatchedChannels = mostWatched?.channels ?? [];
  const mostWatchedRange = mostWatched
    ? `${formatUtcDay(mostWatched.firstDay)} – ${formatUtcDay(mostWatched.lastDay)}`
    : null;

  return (
    <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
      {/* Fastest Growing */}
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight text-n-ink">
            Emerging Channels
            <InfoTip info={GAME_INFO.emerging} />
          </h3>
          <span className="text-xs text-n-slate">
            Started recently or growing
          </span>
        </div>
        <div className="space-y-0.5">
          {emerging.length === 0 ? (
            <p className="text-sm text-n-slate">No data available</p>
          ) : (
            emerging.map((ch) => <ChannelRow key={ch.id} channel={ch} />)
          )}
        </div>
        {emerging.length > 0 && (
          <div className="mt-3">
            <SyncStatus lastSyncedAt={latestUpdate(emerging)} />
          </div>
        )}
      </div>

      {/* Most Watched */}
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xl font-bold tracking-tight text-n-ink">
            Most Watched Channels
            <InfoTip
              info={
                mostWatchedRange
                  ? withWindow(GAME_INFO.mostWatched, mostWatchedRange)
                  : GAME_INFO.mostWatched
              }
            />
          </h3>
          <span className="text-xs text-n-slate">
            Last 7 days, by hours watched
          </span>
        </div>
        <div className="space-y-0.5">
          {mostWatchedChannels.length === 0 ? (
            <p className="text-sm text-n-slate">
              {mostWatched === null
                ? "Channel discovery is temporarily unavailable. Try reloading this page."
                : "No watched channels recorded for this period."}
            </p>
          ) : (
            mostWatchedChannels.map((ch) => (
              <MostWatchedRow
                key={`${ch.platform}:${ch.platformUserId}`}
                channel={ch}
              />
            ))
          )}
        </div>
        {mostWatchedChannels.length > 0 && mostWatchedRange && (
          <p className="mt-5 text-xs text-n-slate">{mostWatchedRange}</p>
        )}
      </div>
    </div>
  );
}
