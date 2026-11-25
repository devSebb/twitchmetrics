import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CreatorRankingView,
  creatorRankingTitle,
} from "@/components/rankings/CreatorRankingView";
import {
  creatorSummary,
  type CreatorRankingSubject,
} from "@/components/rankings/content";
import { metaDescription, rankingMetadata } from "@/lib/ranking-metadata";
import { RANKINGS_PATH, gameRankingPath } from "@/lib/rankings";
import { db } from "@/server/db";
import {
  getCreatorRanking,
  listGameRankings,
} from "@/server/services/rankings";

type PageProps = { params: Promise<{ slug: string }> };

export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

/**
 * A game has a ranking only when the worker published one (enough creators
 * streamed it), so a thin game never gets a page.
 */
const load = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const [game, ranking] = await Promise.all([
    db.game.findUnique({ where: { slug }, select: { slug: true, name: true } }),
    getCreatorRanking({
      scope: "all-platforms",
      metric: "most-watched",
      gameSlug: slug,
    }),
  ]);
  if (!game || !ranking) return null;
  const subject: CreatorRankingSubject = {
    scope: "all-platforms",
    metric: "most-watched",
    phrase: `most watched ${game.name} streamers`,
    singular: `most watched ${game.name} streamer`,
    game,
  };
  return { subject, ranking, game };
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const loaded = await load((await params).slug);
  if (!loaded) return {};
  const { subject, ranking, game } = loaded;
  return rankingMetadata({
    title: creatorRankingTitle(subject, ranking),
    description: metaDescription(
      creatorSummary(subject, ranking.rows, ranking.windowEnd),
    ),
    path: gameRankingPath(game.slug),
  });
}

export default async function GameRankingPage({ params }: PageProps) {
  const [loaded, games] = await Promise.all([
    load((await params).slug),
    listGameRankings(),
  ]);
  if (!loaded) notFound();
  const { subject, ranking, game } = loaded;

  return (
    <CreatorRankingView
      subject={subject}
      ranking={ranking}
      games={games}
      path={gameRankingPath(game.slug)}
      breadcrumbs={[
        { label: "Rankings", href: RANKINGS_PATH },
        { label: "By game", href: `${RANKINGS_PATH}#by-game` },
        { label: game.name },
      ]}
    />
  );
}
