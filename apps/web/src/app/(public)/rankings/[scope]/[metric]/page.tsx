import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import {
  CreatorRankingView,
  creatorRankingTitle,
} from "@/components/rankings/CreatorRankingView";
import { creatorSummary } from "@/components/rankings/content";
import { metaDescription, rankingMetadata } from "@/lib/ranking-metadata";
import {
  RANKINGS_PATH,
  isCreatorMetric,
  isRankingScope,
  metricLabel,
  metricsForScope,
  rankingExists,
  rankingPath,
  rankingPhrase,
  rankingSingular,
  scopeLabel,
  type CreatorMetric,
  type RankingScope,
} from "@/lib/rankings";
import {
  getCreatorRanking,
  listGameRankings,
} from "@/server/services/rankings";

type PageProps = { params: Promise<{ scope: string; metric: string }> };

// The rankings are rebuilt once a day; an hour keeps a page close to that
// without a database read per visit. Empty generateStaticParams opts the
// route into on-demand static generation.
export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

const loadRanking = cache((scope: RankingScope, metric: CreatorMetric) =>
  getCreatorRanking({ scope, metric }),
);

function parse(params: { scope: string; metric: string }) {
  const { scope, metric } = params;
  if (!isRankingScope(scope) || !isCreatorMetric(metric)) return null;
  if (!rankingExists(scope, metric)) return null;
  return {
    scope,
    metric,
    phrase: rankingPhrase(scope, metric),
    singular: rankingSingular(scope, metric),
  };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const subject = parse(await params);
  if (!subject) return {};
  const ranking = await loadRanking(subject.scope, subject.metric);
  if (!ranking) return {};
  return rankingMetadata({
    title: creatorRankingTitle(subject, ranking),
    description: metaDescription(
      creatorSummary(subject, ranking.rows, ranking.windowEnd),
    ),
    path: rankingPath(subject.scope, subject.metric),
  });
}

export default async function CreatorRankingPage({ params }: PageProps) {
  const subject = parse(await params);
  if (!subject) notFound();
  const [ranking, games] = await Promise.all([
    loadRanking(subject.scope, subject.metric),
    listGameRankings(),
  ]);
  if (!ranking) notFound();

  const path = rankingPath(subject.scope, subject.metric);
  // The platform crumb leads to that platform's first ranking.
  const scopeHome = rankingPath(
    subject.scope,
    metricsForScope(subject.scope)[0] ?? subject.metric,
  );

  return (
    <CreatorRankingView
      subject={subject}
      ranking={ranking}
      games={games}
      path={path}
      breadcrumbs={[
        { label: "Rankings", href: RANKINGS_PATH },
        {
          label: scopeLabel(subject.scope),
          ...(scopeHome !== path ? { href: scopeHome } : {}),
        },
        { label: metricLabel(subject.metric) },
      ]}
    />
  );
}
