import Image from "next/image";
import type { Platform } from "@twitchmetrics/database";
import { formatNumber } from "@/lib/utils/format";
import { PlatformIcon, SyncStatus } from "@/components/shared";
import { GameCoverImage } from "@/components/games/GameCoverImage";

type PlatformMetricRow = {
  platform: Platform;
  value: number;
};

type PlatformMetricGroup = {
  rows: PlatformMetricRow[];
  total: number;
};

type GameHeaderProps = {
  game: {
    name: string;
    slug: string;
    coverImageUrl: string | null;
    developer: string | null;
    publisher: string | null;
    releaseDate: string | null;
    currentViewers: number;
    currentChannels: number;
    peakViewers24h: number;
    avgViewers7d: number;
    avgLiveChannels: number;
    lastUpdatedAt: string | null;
    platformMetrics: {
      latestViewers: PlatformMetricGroup;
      latestChannels: PlatformMetricGroup;
    };
  };
};

function KpiCard({
  label,
  value,
  platformRows,
  className,
}: {
  label: string;
  value: number;
  platformRows?: PlatformMetricRow[];
  className?: string;
}) {
  const rows = platformRows?.filter((row) => row.value > 0) ?? [];

  return (
    <div
      className={`relative flex min-h-[86px] flex-col justify-between gap-2 rounded-xl border border-[#3F4147] bg-[#313338] px-4 py-3 ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#949BA4]">
          {label}
        </span>
        {rows.length > 0 ? (
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.platform}
                className="flex items-center justify-between gap-2"
              >
                <span className="text-lg font-bold leading-tight text-[#F2F3F5]">
                  {formatNumber(row.value)}
                </span>
                <PlatformIcon platform={row.platform} size="xs" rounded="lg" />
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xl font-bold text-[#F2F3F5]">
            {formatNumber(value)}
          </span>
        )}
      </div>
      {rows.length > 1 && (
        <div className="flex items-center justify-between border-t border-[#3F4147] pt-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[#949BA4]">
            Total
          </span>
          <span className="text-sm font-bold text-[#DBDEE1]">
            {formatNumber(value)}
          </span>
        </div>
      )}
      {rows.length === 0 && (
        <div className="absolute right-4 top-3">
          <PlatformIcon platform="twitch" size="xs" rounded="lg" />
        </div>
      )}
    </div>
  );
}

function ProCtaCard({ className }: { className?: string }) {
  return (
    <a
      href="https://streamhatchet.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col justify-center rounded-xl px-4 py-3 transition-colors hover:bg-white/5 ${className ?? ""}`}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-[#949BA4]">
        Want Pro-level Data?
      </span>
      <span className="mt-1.5 text-base font-semibold text-[#DBDEE1]">
        Find out more →
      </span>
      <Image
        src="/brand/streamhatchet.png"
        alt="Stream Hatchet"
        width={144}
        height={52}
        className="mt-3 h-auto w-36"
      />
    </a>
  );
}

export function GameHeader({ game }: GameHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      {/* Cover Art (portrait, preserved) */}
      <div className="relative aspect-[3/4] w-[220px] max-w-full flex-shrink-0 overflow-hidden rounded-lg bg-[#383A40]">
        <GameCoverImage
          src={game.coverImageUrl}
          name={game.name}
          sizes="220px"
          className="object-cover"
          priority
        />
      </div>

      {/* Content area — 4 cols × 2 rows; cards stretch to fill cover height */}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-4 sm:grid-rows-2">
        {/* Row 1 col 1: title + meta */}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-[#F2F3F5] sm:text-4xl">
            {game.name}
          </h1>
          <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {game.developer && (
              <>
                <span className="text-[#949BA4]">Developed by:</span>
                <span className="font-medium text-[#DBDEE1]">
                  {game.developer}
                </span>
              </>
            )}
            {game.releaseDate && (
              <>
                <span className="text-[#949BA4]">Release Date:</span>
                <span className="font-medium text-[#DBDEE1]">
                  {new Date(game.releaseDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </>
            )}
          </div>
          <div className="mt-3">
            <SyncStatus lastSyncedAt={game.lastUpdatedAt} />
          </div>
        </div>

        {/* Row 1 cols 2–3 */}
        <KpiCard label="Avg Viewers" value={game.avgViewers7d} />
        <KpiCard label="Peak Viewers" value={game.peakViewers24h} />

        {/* Pro CTA — col 4, spans rows 1–2 */}
        <ProCtaCard className="sm:col-start-4 sm:row-start-1 sm:row-span-2 sm:h-full" />

        {/* Row 2 cols 1–3 (auto-fill around CTA) */}
        <KpiCard
          label="Latest Viewers"
          value={
            game.platformMetrics.latestViewers.total > 0
              ? game.platformMetrics.latestViewers.total
              : game.currentViewers
          }
          platformRows={game.platformMetrics.latestViewers.rows}
        />
        <KpiCard
          label="Latest Channels"
          value={
            game.platformMetrics.latestChannels.total > 0
              ? game.platformMetrics.latestChannels.total
              : game.currentChannels
          }
          platformRows={game.platformMetrics.latestChannels.rows}
        />
        <KpiCard label="Avg Live Channels" value={game.avgLiveChannels} />
      </div>
    </div>
  );
}
