import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { getGamePlatformMetrics } from "@/server/services/game-platform-metrics";
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
      topChannels: {
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

function topChannelSourcePriority(source: string | null | undefined): number {
  switch (source) {
    case "twitch_api":
    case "kick_api":
      return 100;
    case "streamhatchet_live":
      return 80;
    case "api":
      return 50;
    default:
      return 10;
  }
}

function selectDisplayTopChannels<
  T extends {
    platform?: string | null;
    source?: string | null;
    channelName: string;
    category: string;
    avgViewers: number;
  },
>(channels: T[]): T[] {
  const byChannel = new Map<string, T>();

  for (const channel of channels) {
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

  const platformMetrics = await getGamePlatformMetrics({
    gameId: game.id,
  });
  const latestSnapshot = game.viewerSnapshots[0] ?? null;

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
    peakViewers24h: game.peakViewers24h,
    avgViewers7d: game.avgViewers7d,
    avgLiveChannels: game.avgLiveChannels,
    lastUpdatedAt: latestSnapshot ? String(latestSnapshot.snapshotAt) : null,
    platformMetrics,
  };

  // Shape snapshot data for charts (reverse to chronological order)
  const snapshots = [...game.viewerSnapshots].reverse();

  const chartData = snapshots.map((s) => ({
    date: String(s.snapshotAt),
    totalViewers: s.totalViewers,
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
          initialData={activityData}
        />
      </div>

      <GameViewerChart slug={game.slug} initialData={chartData} />

      <GameTopChannels channels={selectDisplayTopChannels(game.topChannels)} />

      <GameClips clips={game.clips} />
    </div>
  );
}
