import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import {
  getGamePlatformMetrics,
  getGameWindowMetrics,
} from "@/server/services/game-platform-metrics";
import {
  deriveGameMetrics,
  summarizeViewerSeries,
} from "@/server/services/game-metrics";
import {
  liveTopChannelWhere,
  selectDisplayTopChannels,
} from "@/server/services/game-top-channels";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import {
  GameHeader,
  GameViewerChart,
  BroadcastLanguages,
  ViewerChannelActivityChart,
  GameTopChannels,
  GameClips,
} from "@/components/game";

type PageProps = {
  params: Promise<{ slug: string }>;
};

// ISR: one game-snapshot run (*/30). The header and both charts are built from
// the same snapshots and the charts ask for the window ending at the page's
// newest snapshot, so a cached page still agrees with itself.
// Empty generateStaticParams opts the route into on-demand static
// generation — without it every request re-renders from scratch.
export const revalidate = 1800;
export function generateStaticParams() {
  return [];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function getGame(slug: string) {
  const game = await db.game.findUnique({
    where: { slug },
    include: {
      viewerSnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 1,
      },
      broadcastLanguages: {
        orderBy: { percent: "desc" },
        take: 5,
      },
      topChannels: {
        where: liveTopChannelWhere(),
        orderBy: [{ avgViewers: "desc" }, { updatedAt: "desc" }],
        take: 50,
      },
      clips: {
        orderBy: { viewCount: "desc" },
        take: 8,
      },
    },
  });

  if (!game) return null;
  return serializeBigInt(game);
}

/**
 * The 7 days of snapshots ending at the newest one. The header's 7d average
 * and 24h peak are derived from exactly these rows, and the charts open on the
 * same window, so the page's numbers agree with each other.
 */
async function getWeekSeries(gameId: string, until: Date | null) {
  if (!until) return [];
  return db.gameViewerSnapshot.findMany({
    where: {
      gameId,
      snapshotAt: { gte: new Date(until.getTime() - WEEK_MS), lte: until },
    },
    orderBy: { snapshotAt: "asc" },
    select: { snapshotAt: true, totalViewers: true, totalChannels: true },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);

  if (!game) {
    return { title: "Game Not Found | TwitchMetrics" };
  }

  const latestSnapshot = game.viewerSnapshots[0];
  const viewersStr = formatNumber(
    latestSnapshot?.totalViewers ?? game.currentViewers,
  );
  const channelsStr = formatNumber(
    latestSnapshot?.totalChannels ?? game.currentChannels,
  );

  const description = `Latest observed viewership for ${game.name}: ${viewersStr} viewers across ${channelsStr} channels.`;

  return {
    title: `${game.name} - Game Analytics`,
    description,
    openGraph: {
      title: `${game.name} | ${SITE_NAME}`,
      description: `${viewersStr} viewers across ${channelsStr} channels in the latest snapshot`,
      images: game.coverImageUrl
        ? [{ url: game.coverImageUrl, width: 264, height: 352, alt: game.name }]
        : [],
      type: "website",
      url: `${SITE_URL}/game/${slug}`,
    },
    twitter: {
      card: "summary",
      site: TWITTER_HANDLE,
      title: `${game.name} | ${SITE_NAME}`,
      description: `${viewersStr} viewers across ${channelsStr} channels in the latest snapshot`,
      images: game.coverImageUrl ? [game.coverImageUrl] : [],
    },
    alternates: {
      canonical: `${SITE_URL}/game/${slug}`,
    },
  };
}

export default async function GamePage({ params }: PageProps) {
  const { slug } = await params;
  const game = await getGame(slug);

  if (!game) {
    notFound();
  }

  const latestSnapshot = game.viewerSnapshots[0] ?? null;
  // serializeBigInt turned the Date into its ISO string.
  const until = latestSnapshot
    ? new Date(String(latestSnapshot.snapshotAt))
    : null;
  const [platformMetrics, weekSeries] = await Promise.all([
    getGamePlatformMetrics({ gameId: game.id }),
    getWeekSeries(game.id, until),
  ]);
  const metrics =
    until && weekSeries.length > 0
      ? deriveGameMetrics(weekSeries, until)
      : null;
  // Kick and YouTube for the same 7 days, next to the Twitch figures above.
  const windowMetrics =
    until && metrics
      ? await getGameWindowMetrics({
          gameId: game.id,
          until,
          twitch: {
            avgViewers: metrics.avgViewers7d,
            peakViewers24h: metrics.peakViewers24h,
            avgChannels: metrics.avgLiveChannels,
          },
        })
      : null;

  // Shape header data
  const headerData = {
    name: game.name,
    slug: game.slug,
    coverImageUrl: game.coverImageUrl,
    developer: game.developer,
    publisher: game.publisher,
    releaseDate: game.releaseDate ? String(game.releaseDate) : null,
    currentViewers: latestSnapshot?.totalViewers ?? game.currentViewers,
    currentChannels: latestSnapshot?.totalChannels ?? game.currentChannels,
    peakViewers24h: metrics?.peakViewers24h ?? game.peakViewers24h,
    avgViewers7d: metrics?.avgViewers7d ?? game.avgViewers7d,
    avgLiveChannels: metrics?.avgLiveChannels ?? game.avgLiveChannels,
    lastUpdatedAt: latestSnapshot ? String(latestSnapshot.snapshotAt) : null,
    platformMetrics,
    windowMetrics,
  };

  const chartUntil = until?.toISOString() ?? null;

  const chartData = weekSeries.map((s) => ({
    date: s.snapshotAt.toISOString(),
    totalViewers: s.totalViewers,
  }));

  const activityData = weekSeries.map((s) => ({
    date: s.snapshotAt.toISOString(),
    viewers: s.totalViewers,
    channels: s.totalChannels,
  }));

  // VideoGame JSON-LD for rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.name,
    url: `${SITE_URL}/game/${game.slug}`,
    image: game.coverImageUrl ?? undefined,
    genre: game.genres,
    ...(game.developer
      ? { author: { "@type": "Organization", name: game.developer } }
      : {}),
    ...(game.publisher
      ? { publisher: { "@type": "Organization", name: game.publisher } }
      : {}),
    ...(game.releaseDate ? { datePublished: String(game.releaseDate) } : {}),
  };

  // BreadcrumbList JSON-LD for search result breadcrumbs
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: "Browse",
        item: `${SITE_URL}/browse`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: game.name,
        item: `${SITE_URL}/game/${game.slug}`,
      },
    ],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <GameHeader game={headerData} />

      {/* Broadcast languages + activity chart */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
        <BroadcastLanguages languages={game.broadcastLanguages} />
        <ViewerChannelActivityChart
          slug={game.slug}
          until={chartUntil}
          initialData={activityData}
        />
      </div>

      <GameViewerChart
        slug={game.slug}
        until={chartUntil}
        initialData={chartData}
        initialSummary={summarizeViewerSeries(weekSeries)}
      />

      <GameTopChannels channels={selectDisplayTopChannels(game.topChannels)} />

      <GameClips clips={game.clips} />
    </div>
  );
}
