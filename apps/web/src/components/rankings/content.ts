import { formatNumber } from "@/lib/utils/format";
import {
  CATEGORY_METRICS,
  RANKING_AVG_MIN_HOURS,
  RANKING_WINDOW_DAYS,
  categoryMetricLabel,
  categoryRankingPath,
  gameRankingPath,
  metricLabel,
  metricsForScope,
  rankingDay,
  rankingPath,
  scopeLabel,
  scopesForMetric,
  type CategoryMetric,
  type CreatorMetric,
  type RankingScope,
} from "@/lib/rankings";
import type {
  CategoryRankingRow,
  CreatorRankingRow,
  GameRankingLink,
} from "@/server/services/rankings";
import type {
  RankingFaq,
  RankingFilterGroup,
  RankingLinkGroup,
  RankingStat,
} from "./RankingPage";

/**
 * The words on a ranking page, written from that page's own rows: summary,
 * key figures, questions and methodology. Nothing here is a fixed paragraph
 * shared between pages, which is what keeps hundreds of ranking pages from
 * reading as copies of each other.
 */

function hours(minutes: number): string {
  return formatNumber(Math.round(minutes / 60));
}

/** A ranked value as it reads in a sentence. */
export function valueInWords(metric: CreatorMetric, value: number): string {
  switch (metric) {
    case "most-watched":
      return `${hours(value)} hours watched`;
    case "average-viewers":
      return `${formatNumber(Math.round(value))} average viewers`;
    case "peak-viewers":
      return `a peak of ${formatNumber(value)} viewers`;
    case "fastest-growing":
      return `${formatNumber(value)} followers gained`;
    case "most-followed":
      return `${formatNumber(value)} followers`;
  }
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Rows that were not in the top `depth` last period. */
function entrants(
  rows: { rank: number; movement: CreatorRankingRow["movement"] }[],
) {
  return rows.filter(
    (row) =>
      row.movement.kind === "new" ||
      (row.movement.kind === "up" &&
        row.rank + row.movement.places > rows.length),
  ).length;
}

function biggestClimber<
  Row extends { rank: number; movement: CreatorRankingRow["movement"] },
>(rows: Row[]): { row: Row; places: number } | null {
  let best: { row: Row; places: number } | null = null;
  for (const row of rows) {
    if (row.movement.kind !== "up") continue;
    if (!best || row.movement.places > best.places) {
      best = { row, places: row.movement.places };
    }
  }
  return best;
}

export type CreatorRankingSubject = {
  metric: CreatorMetric;
  scope: RankingScope;
  /** "most watched Twitch streamers". */
  phrase: string;
  /** "most watched Twitch streamer". */
  singular: string;
  /** Set on a ranking within one game. */
  game?: { slug: string; name: string };
};

function periodWords(metric: CreatorMetric): string {
  return metric === "most-followed"
    ? ""
    : ` in the last ${RANKING_WINDOW_DAYS} days`;
}

export function creatorSummary(
  subject: CreatorRankingSubject,
  rows: CreatorRankingRow[],
  windowEnd: Date,
): string {
  const [first, second, third] = rows;
  if (!first) return "";
  const where = subject.game ? ` on ${subject.game.name}` : "";
  let text = `As of ${rankingDay(windowEnd)}, ${first.creator.displayName} is the ${subject.singular}, with ${valueInWords(subject.metric, first.value)}${where}${periodWords(subject.metric)}`;
  if (second && third) {
    text += `, ahead of ${second.creator.displayName} (${valueInWords(subject.metric, second.value)}) and ${third.creator.displayName} (${valueInWords(subject.metric, third.value)})`;
  }
  text += ".";
  const climber = biggestClimber(rows);
  if (climber) {
    text += ` ${climber.row.creator.displayName} climbed the most, up ${climber.places} ${climber.places === 1 ? "place" : "places"} to number ${climber.row.rank}.`;
  }
  return text;
}

export function creatorStats(rows: CreatorRankingRow[]): RankingStat[] {
  const stats: RankingStat[] = [];
  const watched = rows.reduce(
    (sum, row) => sum + (row.stats.minutesWatched ?? 0),
    0,
  );
  stats.push({
    label: "Combined hours watched",
    value: hours(watched),
    note: `Across all ${rows.length} creators`,
  });

  const peak = rows
    .filter((row) => row.stats.peakViewers != null)
    .sort((a, b) => (b.stats.peakViewers ?? 0) - (a.stats.peakViewers ?? 0))[0];
  stats.push({
    label: "Highest peak",
    value: peak ? formatNumber(peak.stats.peakViewers ?? 0) : "—",
    note: peak ? `${peak.creator.displayName}, viewers at once` : "No data",
  });

  const grower = rows
    .filter((row) => (row.stats.followerDelta30d ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.stats.followerDelta30d ?? 0) - (a.stats.followerDelta30d ?? 0),
    )[0];
  const climber = biggestClimber(rows);
  if (grower) {
    stats.push({
      label: "Most followers gained",
      value: `+${formatNumber(grower.stats.followerDelta30d ?? 0)}`,
      note: `${grower.creator.displayName}, in 30 days`,
    });
  } else if (climber) {
    stats.push({
      label: "Biggest climber",
      value: `Up ${climber.places}`,
      note: `${climber.row.creator.displayName}, now number ${climber.row.rank}`,
    });
  } else {
    stats.push({
      label: "Combined airtime",
      value: `${hours(rows.reduce((sum, row) => sum + (row.stats.airtimeMinutes ?? 0), 0))}h`,
      note: `Hours live across the ${rows.length}`,
    });
  }

  const compared = rows.some((row) => row.movement.kind !== "none");
  if (compared) {
    stats.push({
      label: "New this period",
      value: String(entrants(rows)),
      note: `Creators entering the top ${rows.length}`,
    });
  } else {
    stats.push({
      label: "Combined followers",
      value: formatNumber(
        rows.reduce((sum, row) => sum + (row.stats.followers ?? 0), 0),
      ),
      note: `Across all ${rows.length} creators`,
    });
  }
  return stats;
}

function creatorMethodology(
  subject: CreatorRankingSubject,
  compared: boolean,
): string[] {
  const { metric, scope, game } = subject;
  const lines: string[] = [
    "Only creators listed on Noticed are ranked: profiles with recent live streams on Twitch, YouTube or Kick.",
  ];
  if (game) {
    lines.push(
      `Hours watched counts only the time a creator spent streaming ${game.name}, added up across Twitch, YouTube and Kick. A stream that covered several games is split between them.`,
    );
  } else if (metric === "most-watched") {
    lines.push(
      "Hours watched is the total time viewers spent watching a creator's live streams in the period.",
    );
  } else if (metric === "average-viewers") {
    lines.push(
      `Average viewers is hours watched divided by hours live. A creator needs at least ${RANKING_AVG_MIN_HOURS} hours live in the period to be ranked, so one short stream cannot top the list.`,
    );
  } else if (metric === "peak-viewers") {
    lines.push(
      "Peak viewers is the highest number of people watching a creator at one moment, on a single platform.",
    );
  } else if (metric === "fastest-growing") {
    lines.push(
      "Followers gained compares today's follower count with the count 30 days ago, on Twitch and YouTube.",
      "It is measured for the creators whose accounts we read every day, about 44,000 profiles, so a fast-growing creator outside that group can be missing. Gains above 100% in 30 days are left out as likely corrections.",
    );
  } else {
    lines.push(
      scope === "all-platforms"
        ? "Total followers adds up a creator's followers on every platform linked to their profile, including Instagram, TikTok and X."
        : `Followers is the creator's count on ${scopeLabel(scope)}${scope === "youtube" ? " (subscribers)" : ""}.`,
    );
  }
  if (scope === "all-platforms" && !game && metric !== "most-followed") {
    lines.push(
      "A creator who streams on several platforms at once is ranked once. Watch time is added up across Twitch, YouTube and Kick, and time on air is counted once.",
    );
  }
  if (scope === "instagram" || scope === "tiktok" || scope === "x") {
    lines.push(
      "The viewing figures in the other columns cover the creator's live streams on Twitch, YouTube and Kick.",
    );
  }
  if (compared) {
    lines.push(
      metric === "most-followed"
        ? "The change column compares each place with the order 30 days ago, worked out from each creator's 30-day follower change."
        : `The change column compares each place with the same ranking for the ${RANKING_WINDOW_DAYS} days before. New means the creator was outside the top 500 then.`,
    );
  }
  return lines;
}

export function creatorFaqs(
  subject: CreatorRankingSubject,
  rows: CreatorRankingRow[],
  windowEnd: Date,
): RankingFaq[] {
  const first = rows[0];
  if (!first) return [];
  const { metric, phrase, singular } = subject;
  const where = subject.game ? ` on ${subject.game.name}` : "";
  const faqs: RankingFaq[] = [
    {
      question: `Who is the ${singular} right now?`,
      answer: `${first.creator.displayName}, with ${valueInWords(metric, first.value)}${where}${periodWords(metric)}, as of ${rankingDay(windowEnd)}.`,
    },
    {
      question: `Who are the top 10 ${phrase}?`,
      answer: `${listNames(rows.slice(0, 10).map((row) => row.creator.displayName))}.`,
    },
  ];
  const climber = biggestClimber(rows);
  if (climber) {
    faqs.push({
      question: "Who moved up the most since the last period?",
      answer: `${climber.row.creator.displayName} rose ${climber.places} ${climber.places === 1 ? "place" : "places"} to number ${climber.row.rank}. ${entrants(rows)} of the ${rows.length} creators were not in the top ${rows.length} in the previous ${RANKING_WINDOW_DAYS} days.`,
    });
  }
  faqs.push(
    {
      question: "How is this ranking worked out?",
      answer: creatorMethodology(
        subject,
        rows.some((row) => row.movement.kind !== "none"),
      )
        .slice(1, 3)
        .join(" "),
    },
    {
      question: "How often is it updated?",
      answer: `Every day. Each update covers the ${RANKING_WINDOW_DAYS} complete days before it, so the list always reflects the most recent month of streams.`,
    },
    {
      question: "How do I get on this list?",
      answer:
        "Any creator with recent live streams on Twitch, YouTube or Kick is ranked automatically. Search for your name, claim your profile and connect your platforms so your figures stay current.",
    },
  );
  return faqs;
}

export function creatorMethodologyLines(
  subject: CreatorRankingSubject,
  rows: CreatorRankingRow[],
): string[] {
  return creatorMethodology(
    subject,
    rows.some((row) => row.movement.kind !== "none"),
  );
}

export function creatorFilters(
  subject: CreatorRankingSubject,
  games: GameRankingLink[],
): RankingFilterGroup[] {
  const { scope, metric, game } = subject;
  const groups: RankingFilterGroup[] = [];
  if (!game) {
    groups.push(
      {
        label: "Platform",
        options: scopesForMetric(metric).map((option) => ({
          label: scopeLabel(option),
          href: rankingPath(option, metric),
          active: option === scope,
        })),
      },
      {
        label: "Ranked by",
        options: metricsForScope(scope).map((option) => ({
          label: metricLabel(option),
          href: rankingPath(scope, option),
          active: option === metric,
        })),
      },
    );
  }
  const shortlist = games.slice(0, 10);
  if (game && !shortlist.some((link) => link.slug === game.slug)) {
    shortlist.push(game);
  }
  // Game rankings are cross-platform, so only the cross-platform most-watched
  // page (their "All games") and the game pages themselves offer the switch.
  const offersGames =
    game != null || (scope === "all-platforms" && metric === "most-watched");
  if (shortlist.length > 0 && offersGames) {
    groups.push({
      label: "Game",
      options: [
        {
          label: "All games",
          href: rankingPath("all-platforms", "most-watched"),
          active: !game,
        },
        ...shortlist.map((link) => ({
          label: link.name,
          href: gameRankingPath(link.slug),
          active: link.slug === game?.slug,
        })),
      ],
    });
  }
  return groups;
}

export function creatorRelated(
  subject: CreatorRankingSubject,
  games: GameRankingLink[],
): RankingLinkGroup[] {
  const { scope, metric, game } = subject;
  const groups: RankingLinkGroup[] = [];
  const sameScope = metricsForScope(scope).filter(
    (option) => game || option !== metric,
  );
  if (sameScope.length > 0) {
    groups.push({
      title: `${scopeLabel(scope)} rankings`,
      links: sameScope.map((option) => ({
        label: `${metricLabel(option)}, ${scopeLabel(scope)}`,
        href: rankingPath(scope, option),
      })),
    });
  }
  if (!game) {
    const otherScopes = scopesForMetric(metric).filter(
      (option) => option !== scope,
    );
    if (otherScopes.length > 0) {
      groups.push({
        title: `${metricLabel(metric)} elsewhere`,
        links: otherScopes.map((option) => ({
          label: `${metricLabel(metric)}, ${scopeLabel(option)}`,
          href: rankingPath(option, metric),
        })),
      });
    }
  }
  const otherGames = games.filter((link) => link.slug !== game?.slug);
  if (otherGames.length > 0) {
    groups.push({
      title: "Top creators by game",
      links: otherGames.slice(0, 8).map((link) => ({
        label: `Top ${link.name} streamers`,
        href: gameRankingPath(link.slug),
      })),
    });
  }
  groups.push(categoryLinkGroup());
  return groups.slice(0, 3);
}

function categoryLinkGroup(exclude?: CategoryMetric): RankingLinkGroup {
  return {
    title: "Categories",
    links: CATEGORY_METRICS.filter((option) => option !== exclude).map(
      (option) => ({
        label: `${categoryMetricLabel(option)} categories`,
        href: categoryRankingPath(option),
      }),
    ),
  };
}

function categoryValueInWords(metric: CategoryMetric, value: number): string {
  return metric === "most-watched"
    ? `${hours(value)} hours watched`
    : `${hours(value)} hours streamed`;
}

export function categorySummary(
  metric: CategoryMetric,
  rows: CategoryRankingRow[],
  windowEnd: Date,
): string {
  const [first, second, third] = rows;
  if (!first) return "";
  const lead =
    metric === "most-watched"
      ? "most watched category in live streaming"
      : "most streamed category";
  let text = `As of ${rankingDay(windowEnd)}, ${first.game.name} is the ${lead}, with ${categoryValueInWords(metric, first.value)} across Twitch, YouTube and Kick in the last ${RANKING_WINDOW_DAYS} days`;
  if (second && third) {
    text += `, ahead of ${second.game.name} (${categoryValueInWords(metric, second.value)}) and ${third.game.name} (${categoryValueInWords(metric, third.value)})`;
  }
  text += ".";
  const climber = biggestClimber(rows);
  if (climber) {
    text += ` ${climber.row.game.name} climbed the most, up ${climber.places} ${climber.places === 1 ? "place" : "places"} to number ${climber.row.rank}.`;
  }
  return text;
}

export function categoryStats(rows: CategoryRankingRow[]): RankingStat[] {
  const watched = rows.reduce(
    (sum, row) => sum + (row.stats.minutesWatched ?? 0),
    0,
  );
  const streamed = rows.reduce(
    (sum, row) => sum + (row.stats.airtimeMinutes ?? 0),
    0,
  );
  const first = rows[0];
  const climber = biggestClimber(rows);
  return [
    {
      label: "Combined hours watched",
      value: hours(watched),
      note: `Across all ${rows.length} categories`,
    },
    {
      label: "Combined hours streamed",
      value: hours(streamed),
      note: `Across all ${rows.length} categories`,
    },
    climber
      ? {
          label: "Biggest climber",
          value: `Up ${climber.places}`,
          note: `${climber.row.game.name}, now number ${climber.row.rank}`,
        }
      : {
          label: "Number one",
          value: first ? first.game.name : "—",
          note: "Leads this ranking",
        },
    {
      label: "New this period",
      value: String(entrants(rows)),
      note: `Categories entering the top ${rows.length}`,
    },
  ];
}

export function categoryMethodology(metric: CategoryMetric): string[] {
  return [
    "Categories are the games and non-gaming categories creators stream under on Twitch, YouTube and Kick. The same game on different platforms is counted as one.",
    metric === "most-watched"
      ? "Hours watched is the total time viewers spent watching streams in the category, added up across the three platforms."
      : "Hours streamed is the total time creators spent live in the category, added up across the three platforms.",
    "Average viewers is hours watched spread over every hour of the period: how many people were watching the category at a typical moment.",
    "YouTube's general video labels, such as Entertainment or Sports, are not counted as categories.",
    `The change column compares each place with the same ranking for the ${RANKING_WINDOW_DAYS} days before.`,
  ];
}

export function categoryFaqs(
  metric: CategoryMetric,
  rows: CategoryRankingRow[],
  windowEnd: Date,
): RankingFaq[] {
  const first = rows[0];
  if (!first) return [];
  const what = metric === "most-watched" ? "most watched" : "most streamed";
  return [
    {
      question: `What is the ${what} category in live streaming right now?`,
      answer: `${first.game.name}, with ${categoryValueInWords(metric, first.value)} across Twitch, YouTube and Kick in the last ${RANKING_WINDOW_DAYS} days, as of ${rankingDay(windowEnd)}.`,
    },
    {
      question: `What are the top 10 ${what} categories?`,
      answer: `${listNames(rows.slice(0, 10).map((row) => row.game.name))}.`,
    },
    {
      question: "How is this ranking worked out?",
      answer: categoryMethodology(metric).slice(0, 2).join(" "),
    },
    {
      question: "How often is it updated?",
      answer: `Every day. Each update covers the ${RANKING_WINDOW_DAYS} complete days before it.`,
    },
  ];
}

export function categoryFilters(metric: CategoryMetric): RankingFilterGroup[] {
  return [
    {
      label: "Ranked by",
      options: CATEGORY_METRICS.map((option) => ({
        label: categoryMetricLabel(option),
        href: categoryRankingPath(option),
        active: option === metric,
      })),
    },
  ];
}

export function categoryRelated(
  metric: CategoryMetric,
  games: GameRankingLink[],
): RankingLinkGroup[] {
  return [
    categoryLinkGroup(metric),
    {
      title: "Creator rankings",
      links: metricsForScope("all-platforms").map((option) => ({
        label: `${metricLabel(option)}, all platforms`,
        href: rankingPath("all-platforms", option),
      })),
    },
    {
      title: "Top creators by game",
      links: games.slice(0, 8).map((link) => ({
        label: `Top ${link.name} streamers`,
        href: gameRankingPath(link.slug),
      })),
    },
  ].filter((group) => group.links.length > 0);
}

export function citationText(
  title: string,
  computedAt: Date,
  url: string,
): string {
  return `Noticed, "${title}". Data by Hatchet, updated ${rankingDay(computedAt)}. ${url}`;
}
