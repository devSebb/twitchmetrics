import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { RankingPage } from "@/components/rankings/RankingPage";
import { RankingTable } from "@/components/rankings/RankingTable";
import {
  categoryFaqs,
  categoryFilters,
  categoryMethodology,
  categoryRelated,
  categoryStats,
  categorySummary,
  citationText,
} from "@/components/rankings/content";
import {
  categoryColumns,
  categoryRankedKey,
  categoryTableRows,
} from "@/components/rankings/rows";
import { SITE_URL } from "@/lib/constants/seo";
import { metaDescription, rankingMetadata } from "@/lib/ranking-metadata";
import {
  RANKINGS_PATH,
  RANKING_OPEN_ROWS,
  capitalise,
  categoryMetricLabel,
  categoryRankingPath,
  categoryRankingPhrase,
  isCategoryMetric,
  rankingMonth,
  type CategoryMetric,
} from "@/lib/rankings";
import {
  getCategoryRanking,
  listGameRankings,
} from "@/server/services/rankings";

type PageProps = { params: Promise<{ metric: string }> };

export const revalidate = 3600;
export function generateStaticParams() {
  return [];
}

const loadRanking = cache((metric: CategoryMetric) =>
  getCategoryRanking({ metric }),
);

function titleOf(metric: CategoryMetric, count: number, windowEnd: Date) {
  return `Top ${count} ${categoryRankingPhrase(metric)} (${rankingMonth(windowEnd)})`;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { metric } = await params;
  if (!isCategoryMetric(metric)) return {};
  const ranking = await loadRanking(metric);
  if (!ranking) return {};
  return rankingMetadata({
    title: titleOf(metric, ranking.rows.length, ranking.windowEnd),
    description: metaDescription(
      categorySummary(metric, ranking.rows, ranking.windowEnd),
    ),
    path: categoryRankingPath(metric),
  });
}

export default async function CategoryRankingPage({ params }: PageProps) {
  const { metric } = await params;
  if (!isCategoryMetric(metric)) notFound();
  const [ranking, games] = await Promise.all([
    loadRanking(metric),
    listGameRankings(),
  ]);
  if (!ranking) notFound();

  const { rows, windowEnd, computedAt } = ranking;
  const title = titleOf(metric, rows.length, windowEnd);
  const url = `${SITE_URL}${categoryRankingPath(metric)}`;
  const rankedBy =
    metric === "most-watched"
      ? "hours watched across Twitch, YouTube and Kick"
      : "hours streamed across Twitch, YouTube and Kick";

  return (
    <RankingPage
      breadcrumbs={[
        { label: "Rankings", href: RANKINGS_PATH },
        { label: "Categories", href: `${RANKINGS_PATH}#categories` },
        { label: categoryMetricLabel(metric) },
      ]}
      title={title}
      windowEnd={windowEnd}
      computedAt={computedAt}
      rankedLine={`${rows.length} categories ranked by ${rankedBy}`}
      sortedLine={`Sorted by ${rankedBy}`}
      summary={categorySummary(metric, rows, windowEnd)}
      topTen={rows.slice(0, 10).map((row) => ({
        name: row.game.name,
        href: `/game/${row.game.slug}`,
      }))}
      stats={categoryStats(rows)}
      filters={categoryFilters(metric)}
      table={
        <RankingTable
          caption={`${capitalise(categoryRankingPhrase(metric))}, ${rankingMonth(windowEnd)}`}
          subject="Category"
          columns={categoryColumns(metric)}
          rankedKey={categoryRankedKey(metric)}
          rows={categoryTableRows(rows)}
          openRows={RANKING_OPEN_ROWS}
        />
      }
      faqs={categoryFaqs(metric, rows, windowEnd)}
      methodology={categoryMethodology(metric)}
      citation={citationText(title, computedAt, url)}
      related={categoryRelated(metric, games)}
      canonicalUrl={url}
      itemList={rows.map((row) => ({
        name: row.game.name,
        url: `${SITE_URL}/game/${row.game.slug}`,
      }))}
    />
  );
}
