import Image from "next/image";
import Link from "next/link";
import { TrendUp, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { formatNumber } from "@/lib/utils/format";

type TopChannel = {
  id: string;
  channelName: string;
  avatarUrl: string | null;
  slug: string | null;
  category: string;
  avgViewers: number;
  airtime: number; // seconds
  viewerHours: bigint | string | number;
};

type GameTopChannelsProps = {
  channels: TopChannel[];
};

function Avatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
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
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#E32C19]/20 text-xs font-bold text-[#E32C19]">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function ChannelRow({
  channel,
  showViewerHours,
}: {
  channel: TopChannel;
  showViewerHours: boolean;
}) {
  const inner = (
    <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-[#383A40]">
      <Avatar name={channel.channelName} avatarUrl={channel.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#DBDEE1]">
          {channel.channelName}
        </p>
        {showViewerHours ? (
          <p className="text-xs text-[#949BA4]">
            {formatNumber(Number(channel.viewerHours))} viewer hours
          </p>
        ) : (
          <p className="text-xs text-[#949BA4]">
            {formatNumber(channel.avgViewers)} avg viewers &middot;{" "}
            {Math.round(channel.airtime / 3600)}h airtime
          </p>
        )}
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

export function GameTopChannels({ channels }: GameTopChannelsProps) {
  const fastestGrowing = channels.filter(
    (c) => c.category === "fastest_growing",
  );
  const mostWatched = channels.filter((c) => c.category === "most_watched");

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* Fastest Growing */}
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
            <TrendUp size={16} weight="duotone" className="text-[#53fc18]" />
            Fastest Growing Channels
          </h2>
          <span className="text-xs text-[#949BA4]">Last 30 Days</span>
        </div>
        <div className="space-y-0.5">
          {fastestGrowing.length === 0 ? (
            <p className="text-sm text-[#949BA4]">No data available</p>
          ) : (
            fastestGrowing.map((ch) => (
              <ChannelRow key={ch.id} channel={ch} showViewerHours={false} />
            ))
          )}
        </div>
      </div>

      {/* Most Watched */}
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
            <MagnifyingGlass
              size={16}
              weight="duotone"
              className="text-[#9146ff]"
            />
            Most Watched Channels
          </h2>
          <span className="text-xs text-[#949BA4]">Last 30 Days</span>
        </div>
        <div className="space-y-0.5">
          {mostWatched.length === 0 ? (
            <p className="text-sm text-[#949BA4]">No data available</p>
          ) : (
            mostWatched.map((ch) => (
              <ChannelRow key={ch.id} channel={ch} showViewerHours />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
