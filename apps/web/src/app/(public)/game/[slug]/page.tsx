import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import {
  getGamePlatformMetrics,
  captionSince,
} from "@/server/services/game-platform-metrics";
import { loadGameSeries } from "@/server/services/game-series-load";
import {
  summarizeGameSeries,
  type SeriesFigures,
} from "@/server/services/game-viewer-series";
import {
  liveTopChannelWhere,
  selectDisplayTopChannels,
} from "@/server/services/game-top-channels";
import { getGameMostWatched } from "@/server/services/game-most-watched";
import { hasGameRanking } from "@/server/services/rankings";
import { gameRankingPath } from "@/lib/rankings";
import { getGameRecentStreams } from "@/server/services/game-recent-streams";
import { getLastCompleteStatsDay } from "@/server/services/creator-streaming-stats";
import { SITE_URL, SITE_NAME, TWITTER_HANDLE } from "@/lib/constants/seo";
import { AppearanceProvider } from "@/components/ui/Appearance";
import {
  EditorialSections,
  type EditorialSection,
} from "@/components/creator/EditorialSections";
import { GameMetricStrip } from "@/components/game/GameHeader";
import {
  GameHeader,
  GamePlatformChart,
  BroadcastLanguages,
  GameTopChannels,
  GameRecentStreams,
  GameClips,
} from "@/components/game";

type PageProps = {
  params: Promise<{ slug: string }>;
};

// ISR: one game-snapshot run (*/30). The header and both charts are built from
// the same series (game-viewer-series.ts) and the charts ask for the window
// ending at the page's newest snapshot, so a cached page agrees with itself.
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

/** Header rows for one figure: a platform that starts late says since when. */
function headerRows(figures: SeriesFigures) {
  return {
    rows: figures.rows.map((row) => ({
      platform: row.platform,
      value: row.value,
      caption: row.since ? captionSince(new Date(row.since)) : null,
    })),
    total: figures.total,
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);

  if (!game) {
    return { title: "Category Not Found" };
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
    title: `${game.name} · ${game.vertical === "gaming" ? "Game" : "Category"} Analytics`,
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
  // One card's data each: a failure empties the card, not the page.
  const lastCompleteDay = getLastCompleteStatsDay();
  const [platformMetrics, series, mostWatched, recentStreams, hasRanking] =
    await Promise.all([
      getGamePlatformMetrics({ gameId: game.id }),
      // The 7 days ending at the newest snapshot, every platform.
      until
        ? loadGameSeries(db, {
            gameId: game.id,
            since: new Date(until.getTime() - WEEK_MS),
            until,
          })
        : null,
      lastCompleteDay
        .then((lastDay) => getGameMostWatched(db, game, lastDay))
        .catch(() => null),
      lastCompleteDay
        .then((lastDay) => getGameRecentStreams(db, game, lastDay))
        .catch(() => null),
      // Only the most watched games have a 30-day creator ranking to link to.
      hasGameRanking(game.slug).catch(() => false),
    ]);
  const summary =
    series && series.slots.length > 0 ? summarizeGameSeries(series) : null;

  // Shape header data
  const headerData = {
    name: game.name,
    slug: game.slug,
    vertical: game.vertical,
    coverImageUrl: game.coverImageUrl,
    developer: game.developer,
    publisher: game.publisher,
    releaseDate: game.releaseDate ? String(game.releaseDate) : null,
    currentViewers: latestSnapshot?.totalViewers ?? game.currentViewers,
    currentChannels: latestSnapshot?.totalChannels ?? game.currentChannels,
    peakViewers24h: game.peakViewers24h,
    avgViewers7d: game.avgViewers7d,
    avgLiveChannels: game.avgLiveChannels,
    lastUpdatedAt: latestSnapshot ? String(latestSnapshot.snapshotAt) : null,
    platformMetrics,
    windowMetrics: summary
      ? {
          avgViewers: headerRows(summary.avgViewers),
          peakViewers: headerRows(summary.peakViewers24h),
          avgChannels: headerRows(summary.avgChannels),
        }
      : null,
  };

  const chartUntil = until?.toISOString() ?? null;

  const chartSeries = series && summary ? { series, summary } : null;

  // Non-game categories share the route without claiming to be video games.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": game.vertical === "gaming" ? "VideoGame" : "WebPage",
    name: game.name,
    url: `${SITE_URL}/game/${game.slug}`,
    image: game.coverImageUrl ?? undefined,
    ...(game.vertical === "gaming" ? { genre: game.genres } : {}),
    ...(game.vertical === "gaming" && game.developer
      ? { author: { "@type": "Organization", name: game.developer } }
      : {}),
    ...(game.vertical === "gaming" && game.publisher
      ? { publisher: { "@type": "Organization", name: game.publisher } }
      : {}),
    ...(game.vertical === "gaming" && game.releaseDate
      ? { datePublished: String(game.releaseDate) }
      : {}),
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
        name: "Categories",
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

  const sections: EditorialSection[] = [
    {
      id: "overview",
      title: "The latest picture.",
      content: (
        <Fragment key="overview">
          <GameMetricStrip game={headerData} />
          <div className="mt-12 border-t border-n-line pt-8">
            <BroadcastLanguages languages={game.broadcastLanguages} />
          </div>
        </Fragment>
      ),
    },
    {
      id: "viewership",
      title: "An audience over time.",
      content: (
        <GamePlatformChart
          key="viewership"
          slug={game.slug}
          metric="viewers"
          until={chartUntil}
          initialData={chartSeries}
          height={360}
        />
      ),
    },
    {
      id: "channels",
      title: "Channel activity.",
      content: (
        <GamePlatformChart
          key="channels"
          slug={game.slug}
          metric="channels"
          until={chartUntil}
          initialData={chartSeries}
          height={320}
        />
      ),
    },
    {
      id: "discover",
      title: "Creators to explore.",
      content: (
        <GameTopChannels
          key="discover"
          channels={selectDisplayTopChannels(game.topChannels)}
          mostWatched={mostWatched}
          rankingHref={hasRanking ? gameRankingPath(game.slug) : null}
        />
      ),
    },
    {
      id: "streams",
      title: "Recent streams.",
      content: <GameRecentStreams key="streams" recent={recentStreams} />,
    },
    ...(game.clips.length > 0
      ? [
          {
            id: "clips",
            title: "Moments worth watching.",
            content: <GameClips key="clips" clips={game.clips} />,
          },
        ]
      : []),
  ];

  return (
    <AppearanceProvider>
      <div className="noticed noticed-analytics min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />

        <GameHeader game={headerData} />
        <EditorialSections
          navigationLabel="Category sections"
          sections={sections}
        />
      </div>
    </AppearanceProvider>
  );
}
