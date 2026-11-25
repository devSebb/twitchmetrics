import { SITE_URL } from "@/lib/constants/seo";
import {
  RANKING_OPEN_ROWS,
  capitalise,
  rankedByText,
  rankingMonth,
  type CreatorMetric,
} from "@/lib/rankings";
import type {
  CreatorRankingRow,
  GameRankingLink,
  Ranking,
} from "@/server/services/rankings";
import { RankingPage, type RankingCrumb } from "./RankingPage";
import { RankingTable } from "./RankingTable";
import {
  citationText,
  creatorFaqs,
  creatorFilters,
  creatorMethodologyLines,
  creatorRelated,
  creatorStats,
  creatorSummary,
  type CreatorRankingSubject,
} from "./content";
import { creatorColumns, creatorTableRows } from "./rows";

/** "Top 50 most watched Twitch streamers (November 2026)". */
export function creatorRankingTitle(
  subject: CreatorRankingSubject,
  ranking: Ranking<CreatorRankingRow>,
): string {
  return `Top ${ranking.rows.length} ${subject.phrase} (${rankingMonth(ranking.windowEnd)})`;
}

/** What a creator ranking sorts by, for the lines above the table. */
export function creatorRankedBy(subject: CreatorRankingSubject): string {
  return subject.game
    ? `hours watched on ${subject.game.name}`
    : rankedByText(subject.scope, subject.metric);
}

const COLUMN_OF_GAME_RANKING: CreatorMetric = "most-watched";

/**
 * A creator ranking page: the platform rankings and the per-game ones are
 * this same view, so they cannot drift apart in layout.
 */
export function CreatorRankingView({
  subject,
  ranking,
  games,
  path,
  breadcrumbs,
}: {
  subject: CreatorRankingSubject;
  ranking: Ranking<CreatorRankingRow>;
  games: GameRankingLink[];
  /** Canonical path of this page. */
  path: string;
  breadcrumbs: RankingCrumb[];
}) {
  const { rows, windowEnd, computedAt } = ranking;
  const title = creatorRankingTitle(subject, ranking);
  const url = `${SITE_URL}${path}`;
  const rankedBy = creatorRankedBy(subject);
  const metric = subject.game ? COLUMN_OF_GAME_RANKING : subject.metric;

  return (
    <RankingPage
      breadcrumbs={breadcrumbs}
      title={title}
      windowEnd={windowEnd}
      computedAt={computedAt}
      rankedLine={`${rows.length} creators ranked by ${rankedBy}`}
      sortedLine={`Sorted by ${rankedBy}`}
      summary={creatorSummary(subject, rows, windowEnd)}
      topTen={rows.slice(0, 10).map((row) => ({
        name: row.creator.displayName,
        href: `/creator/${row.creator.slug}`,
      }))}
      stats={creatorStats(rows)}
      filters={creatorFilters(subject, games)}
      table={
        <RankingTable
          caption={`${capitalise(subject.phrase)}, ${rankingMonth(windowEnd)}`}
          subject="Creator"
          columns={creatorColumns(metric)}
          rankedKey={creatorColumns(metric)[0]?.key ?? ""}
          rows={creatorTableRows(rows, { showKnownFor: !subject.game })}
          openRows={RANKING_OPEN_ROWS}
        />
      }
      faqs={creatorFaqs(subject, rows, windowEnd)}
      methodology={creatorMethodologyLines(subject, rows)}
      citation={citationText(title, computedAt, url)}
      related={creatorRelated(subject, games)}
      canonicalUrl={url}
      itemList={rows.map((row) => ({
        name: row.creator.displayName,
        url: `${SITE_URL}/creator/${row.creator.slug}`,
      }))}
    />
  );
}
