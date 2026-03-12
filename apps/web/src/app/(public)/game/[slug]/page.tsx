import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { GameHeader, GameViewerChart, TopStreamers } from "@/components/game";

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
    },
  });

  if (!game) return null;
  return serializeBigInt(game);
}

async function getTopCreators() {
  const creators = await db.creatorProfile.findMany({
    orderBy: { totalFollowers: "desc" },
    take: 10,
    select: {
      displayName: true,
      slug: true,
      avatarUrl: true,
      totalFollowers: true,
      primaryPlatform: true,
    },
  });
  return serializeBigInt(creators);
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

  return {
    title: `${game.name} - Game Analytics | TwitchMetrics`,
    description: `Live viewership data for ${game.name}. ${viewersStr} current viewers across ${channelsStr} channels.`,
    openGraph: {
      title: `${game.name} | TwitchMetrics`,
      description: `${viewersStr} current viewers across ${channelsStr} channels`,
      images: game.coverImageUrl ? [{ url: game.coverImageUrl }] : [],
      type: "website",
    },
    twitter: {
      card: "summary",
      title: `${game.name} | TwitchMetrics`,
      description: `${viewersStr} current viewers across ${channelsStr} channels`,
      images: game.coverImageUrl ? [game.coverImageUrl] : [],
    },
  };
}

export default async function GamePage({ params }: PageProps) {
  const { slug } = await params;
  const [game, topCreators] = await Promise.all([
    getGame(slug),
    getTopCreators(),
  ]);

  if (!game) {
    notFound();
  }

  // Shape header data
  const headerData = {
    name: game.name,
    slug: game.slug,
    coverImageUrl: game.coverImageUrl,
    genres: game.genres,
    developer: game.developer,
    publisher: game.publisher,
    releaseDate: game.releaseDate ? String(game.releaseDate) : null,
    currentViewers: game.currentViewers,
    currentChannels: game.currentChannels,
    peakViewers24h: game.peakViewers24h,
    avgViewers7d: game.avgViewers7d,
  };

  // Shape snapshot data for chart (reverse to chronological order)
  const chartData = [...game.viewerSnapshots].reverse().map((s) => ({
    date: String(s.snapshotAt),
    totalViewers: s.totalViewers,
    twitchViewers: s.twitchViewers,
    youtubeViewers: s.youtubeViewers,
  }));

  // Shape top creators
  const creatorsData = topCreators.map((c) => ({
    displayName: c.displayName,
    slug: c.slug,
    avatarUrl: c.avatarUrl,
    totalFollowers: String(c.totalFollowers),
    primaryPlatform: c.primaryPlatform,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <GameHeader game={headerData} />
      <GameViewerChart slug={game.slug} initialData={chartData} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TopStreamers creators={creatorsData} />
      </div>
    </div>
  );
}
