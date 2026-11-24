import Link from "next/link";
import type { Platform, Vertical } from "@twitchmetrics/database";
import { Container } from "@/components/ui/Editorial";
import { formatNumber } from "@/lib/utils/format";
import { GAME_KPI_LABELS } from "@/lib/constants/metric-labels";
import { VERTICAL_LABELS } from "@/lib/constants/categories";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { InfoTip, PlatformIcon, SyncStatus } from "@/components/shared";
import { GAME_INFO, type MetricInfo } from "@/lib/constants/metric-info";
import { GameCoverImage } from "@/components/games/GameCoverImage";

type PlatformMetricRow = {
  platform: Platform;
  value: number;
  caption?: string | null;
};
type PlatformMetricGroup = { rows: PlatformMetricRow[]; total: number };

type GameHeaderProps = {
  game: {
    name: string;
    slug: string;
    vertical: Vertical;
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
    windowMetrics: {
      avgViewers: PlatformMetricGroup;
      peakViewers: PlatformMetricGroup;
      avgChannels: PlatformMetricGroup;
    } | null;
  };
};

function Metric({
  label,
  info,
  value,
  platformRows,
  totalLabel = "Total",
  highlight = false,
}: {
  label: string;
  info: MetricInfo;
  value: number;
  platformRows?: PlatformMetricRow[] | undefined;
  totalLabel?: string;
  highlight?: boolean;
}) {
  const rows = platformRows?.filter((row) => row.value > 0) ?? [];
  return (
    <div className="min-w-0 border-t border-n-line pt-5">
      <h3 className="flex items-start gap-2 text-sm font-medium text-n-slate">
        {label}
        <InfoTip info={info} />
      </h3>
      <p
        className={`mt-4 text-4xl font-extrabold tracking-[-.05em] ${highlight ? "text-n-red" : "text-n-ink"}`}
      >
        {formatNumber(value)}
      </p>
      {rows.length > 0 && (
        <>
          <p className="mt-1 text-xs text-n-slate">
            {totalLabel === "Combined"
              ? "Highest combined moment"
              : "Across tracked platforms"}
          </p>
          <dl className="mt-5 space-y-3">
            {rows.map((row) => (
              <div key={row.platform}>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                  <dt className="flex items-center gap-1.5 text-n-slate">
                    <PlatformIcon platform={row.platform} size="xs" />
                    {PLATFORM_CONFIG[row.platform].name}
                  </dt>
                  <dd className="font-semibold">{formatNumber(row.value)}</dd>
                </div>
                {row.caption && (
                  <p className="mt-1 text-xs leading-relaxed text-n-slate">
                    {row.caption}
                  </p>
                )}
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

export function GameMetricStrip({ game }: GameHeaderProps) {
  return (
    <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Metric
        label={GAME_KPI_LABELS.liveViewers}
        info={GAME_INFO.liveViewers}
        value={
          game.platformMetrics.latestViewers.total > 0
            ? game.platformMetrics.latestViewers.total
            : game.currentViewers
        }
        platformRows={game.platformMetrics.latestViewers.rows}
        highlight
      />
      <Metric
        label={GAME_KPI_LABELS.liveChannels}
        info={GAME_INFO.liveChannels}
        value={
          game.platformMetrics.latestChannels.total > 0
            ? game.platformMetrics.latestChannels.total
            : game.currentChannels
        }
        platformRows={game.platformMetrics.latestChannels.rows}
      />
      <Metric
        label={GAME_KPI_LABELS.avgViewers7d}
        info={GAME_INFO.avgViewers7d}
        value={game.windowMetrics?.avgViewers.total ?? game.avgViewers7d}
        platformRows={game.windowMetrics?.avgViewers.rows}
      />
      <Metric
        label={GAME_KPI_LABELS.peakViewers24h}
        info={GAME_INFO.peakViewers24h}
        value={game.windowMetrics?.peakViewers.total ?? game.peakViewers24h}
        platformRows={game.windowMetrics?.peakViewers.rows}
        totalLabel="Combined"
      />
      <Metric
        label={GAME_KPI_LABELS.avgLiveChannels}
        info={GAME_INFO.avgChannels7d}
        value={game.windowMetrics?.avgChannels.total ?? game.avgLiveChannels}
        platformRows={game.windowMetrics?.avgChannels.rows}
      />
    </div>
  );
}

export function GameHeader({ game }: GameHeaderProps) {
  const gaming = game.vertical === "gaming";
  return (
    <header className="n-dark bg-n-ink text-white">
      <Container className="py-12 sm:py-16 lg:py-20">
        <Link
          href={gaming ? "/browse" : `/browse?vertical=${game.vertical}`}
          className="inline-flex min-h-11 items-center text-sm text-white/75 hover:text-white"
        >
          ← {VERTICAL_LABELS[game.vertical]} categories
        </Link>
        <div className="mt-7 grid items-start gap-8 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
          <div className="relative aspect-[3/4] w-32 overflow-hidden rounded bg-white/10 sm:w-full">
            <GameCoverImage
              src={game.coverImageUrl}
              name={game.name}
              sizes="(min-width: 1024px) 220px, (min-width: 640px) 160px, 128px"
              priority
              className="object-cover"
              fallbackClassName="from-n-navy to-n-ink text-white/70"
            />
          </div>
          <div className="min-w-0">
            <p className="n-eyebrow text-white/70">
              {gaming ? "Game" : VERTICAL_LABELS[game.vertical]} analytics
            </p>
            <h1 className="mt-4 break-words text-[clamp(2.5rem,6vw,5.5rem)] font-extrabold leading-[1.02] tracking-[-.05em]">
              {game.name}
              <span className="text-n-red">.</span>
            </h1>
            {gaming &&
              (game.developer || game.publisher || game.releaseDate) && (
                <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-4 text-sm">
                  {game.developer && (
                    <div>
                      <dt className="text-white/60">Developed by</dt>
                      <dd className="mt-1">{game.developer}</dd>
                    </div>
                  )}
                  {game.publisher && (
                    <div>
                      <dt className="text-white/60">Published by</dt>
                      <dd className="mt-1">{game.publisher}</dd>
                    </div>
                  )}
                  {game.releaseDate && (
                    <div>
                      <dt className="text-white/60">Released</dt>
                      <dd className="mt-1">
                        {new Date(game.releaseDate).toLocaleDateString(
                          "en-GB",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          },
                        )}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            <div className="mt-6">
              <SyncStatus lastSyncedAt={game.lastUpdatedAt} />
            </div>
            <div className="mt-8 border-t border-white/25 pt-5 text-sm">
              <p className="text-white/70">Looking for enterprise data?</p>
              <a
                href="https://streamhatchet.com"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block py-2 font-semibold underline underline-offset-4"
              >
                Explore Hatchet ↗
              </a>
            </div>
          </div>
        </div>
      </Container>
    </header>
  );
}
