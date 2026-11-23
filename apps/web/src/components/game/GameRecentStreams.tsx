import Link from "next/link";
import { VideoCamera } from "@phosphor-icons/react/dist/ssr";
import { formatDuration, formatNumber, formatUtcDay } from "@/lib/utils/format";
import { InfoTip, PlatformIcon } from "@/components/shared";
import { GAME_INFO, withWindow } from "@/lib/constants/metric-info";
import type { GameRecentStreams as RecentStreams } from "@/server/services/game-recent-streams";
import { ChannelAvatar } from "./GameTopChannels";

/**
 * The most watched streams of the game on each of the last 7 complete days,
 * across Twitch, Kick and YouTube. Newest day first.
 */
export function GameRecentStreams({
  recent,
}: {
  /** Null when the list couldn't be loaded. */
  recent: RecentStreams | null;
}) {
  const streams = recent?.streams ?? [];
  const range = recent
    ? `${formatUtcDay(recent.firstDay)} – ${formatUtcDay(recent.lastDay)}`
    : null;

  return (
    <div className="mt-6 rounded-lg border border-[#3F4147] bg-[#313338] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#F2F3F5]">
          <VideoCamera size={16} weight="duotone" className="text-[#949BA4]" />
          Recent Streams
          <InfoTip
            info={
              range
                ? withWindow(GAME_INFO.recentStreams, range)
                : GAME_INFO.recentStreams
            }
          />
        </h2>
        <span className="text-xs text-[#949BA4]">
          Top streams of each day, last 7 days
        </span>
      </div>
      {streams.length === 0 ? (
        <p className="text-sm text-[#949BA4]">No data available</p>
      ) : (
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-[#313338] text-left text-[11px] uppercase tracking-wide text-[#949BA4]">
              <tr>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Channel</th>
                <th className="py-2 pr-3 text-right font-medium">Airtime</th>
                <th className="py-2 pr-3 text-right font-medium">
                  Avg viewers
                </th>
                <th className="py-2 pr-3 text-right font-medium">
                  Peak viewers
                </th>
                <th className="py-2 text-right font-medium">Hours watched</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => {
                const channel = (
                  <span className="flex min-w-0 items-center gap-2">
                    <ChannelAvatar
                      name={stream.name}
                      avatarUrl={stream.avatarUrl}
                    />
                    <PlatformIcon
                      platform={stream.platform}
                      size="xs"
                      rounded="lg"
                    />
                    <span className="truncate font-medium text-[#DBDEE1]">
                      {stream.name}
                    </span>
                  </span>
                );
                return (
                  <tr
                    key={`${stream.day}:${stream.platform}:${stream.platformUserId}`}
                    className="border-t border-[#3F4147] text-[#DBDEE1]"
                  >
                    <td className="whitespace-nowrap py-2 pr-3 text-[#949BA4]">
                      {formatUtcDay(stream.day)}
                    </td>
                    <td className="max-w-[260px] py-2 pr-3">
                      {stream.slug ? (
                        <Link
                          href={`/creator/${stream.slug}`}
                          className="hover:underline"
                        >
                          {channel}
                        </Link>
                      ) : (
                        channel
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right">
                      {formatDuration(stream.airtimeMinutes * 60)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {formatNumber(stream.averageViewers)}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {stream.peakViewers === null
                        ? "–"
                        : formatNumber(stream.peakViewers)}
                    </td>
                    <td className="py-2 text-right">
                      {formatNumber(stream.hoursWatched)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
