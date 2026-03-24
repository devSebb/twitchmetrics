import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
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

async function getGame(slug: string) {
  const game = await db.game.findUnique({
    where: { slug },
    include: {
      viewerSnapshots: {
        orderBy: { snapshotAt: "desc" },
        take: 100,
      },
      broadcastLanguages: {
        orderBy: { percent: "desc" },
        take: 5,
      },
      topChannels: true,
      clips: {
        orderBy: { viewCount: "desc" },
        take: 8,
      },
    },
  });

  if (!game) return null;
  return serializeBigInt(game);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const game = await getGame(slug);

  if (!game) {
    return { title: "Game Not Found | TwitchMetrics" };
  }

  const viewersStr = formatNumber(game.currentViewers);
  const channelsStr = formatNumber(game.currentChannels);

  const description = `Live viewership data for ${game.name}. ${viewersStr} current viewers across ${channelsStr} channels.`;

  return {
    title: `${game.name} - Game Analytics`,
    description,
    openGraph: {
      title: `${game.name} | ${SITE_NAME}`,
      description: `${viewersStr} current viewers across ${channelsStr} channels`,
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
      description: `${viewersStr} current viewers across ${channelsStr} channels`,
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

  // Shape header data
  const headerData = {
    name: game.name,
    slug: game.slug,
    coverImageUrl: game.coverImageUrl,
    developer: game.developer,
    publisher: game.publisher,
    releaseDate: game.releaseDate ? String(game.releaseDate) : null,
    currentViewers: game.currentViewers,
    currentChannels: game.currentChannels,
    peakViewers24h: game.peakViewers24h,
    avgViewers7d: game.avgViewers7d,
    avgLiveChannels: game.avgLiveChannels,
  };

  // Shape snapshot data for charts (reverse to chronological order)
  const snapshots = [...game.viewerSnapshots].reverse();

  const chartData = snapshots.map((s) => ({
    date: String(s.snapshotAt),
    totalViewers: s.totalViewers,
    twitchViewers: s.twitchViewers,
    youtubeViewers: s.youtubeViewers,
  }));

  const activityData = snapshots.map((s) => ({
    date: String(s.snapshotAt),
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <GameHeader game={headerData} />

      {/* Broadcast languages + activity chart */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
        <BroadcastLanguages languages={game.broadcastLanguages} />
        <ViewerChannelActivityChart
          slug={game.slug}
          initialData={activityData}
        />
      </div>

      <GameViewerChart slug={game.slug} initialData={chartData} />

      <GameTopChannels channels={game.topChannels} />

      <GameClips clips={game.clips} />
    </div>
  );
}
