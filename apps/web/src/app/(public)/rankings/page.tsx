import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { RankingTable } from "@/components/rankings/RankingTable";
import {
  categoryColumns,
  categoryRankedKey,
  categoryTableRows,
  creatorColumns,
  creatorTableRows,
} from "@/components/rankings/rows";
import { Container, SectionHeading } from "@/components/ui/Editorial";
import { SITE_URL } from "@/lib/constants/seo";
import { rankingMetadata } from "@/lib/ranking-metadata";
import {
  RANKINGS_PATH,
  RANKING_PAGE_DEPTH,
  allCreatorRankings,
  capitalise,
  categoryRankingPath,
  gameRankingPath,
  metricLabel,
  metricsForScope,
  rankingDay,
  rankingMonth,
  rankingPath,
  rankingPhrase,
  scopeLabel,
  type CreatorMetric,
  type RankingScope,
} from "@/lib/rankings";
import {
  getCategoryRanking,
  getCreatorRanking,
  listGameRankings,
} from "@/server/services/rankings";

export const revalidate = 3600;

const LEAD_ROWS = 10;
const CARD_ROWS = 5;
const CARD_METRICS: CreatorMetric[] = [
  "average-viewers",
  "peak-viewers",
  "fastest-growing",
  "most-followed",
];
const STREAM_PLATFORMS: RankingScope[] = ["twitch", "youtube", "kick"];
const SOCIAL_PLATFORMS: RankingScope[] = ["instagram", "tiktok", "x"];

const DESCRIPTION =
  "Rankings of the most watched, fastest growing and most followed streamers on Twitch, YouTube and Kick, plus the top games and categories. Rebuilt every day from Hatchet data.";

export const metadata: Metadata = rankingMetadata({
  title: "Streamer rankings: most watched, fastest growing, most followed",
  description: DESCRIPTION,
  path: RANKINGS_PATH,
});

function ViewAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-bold text-n-ink underline">
      {children}
    </Link>
  );
}

function Card({
  title,
  href,
  note,
  children,
}: {
  title: string;
  href: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col">
      <div className="mb-2 border-t-2 border-n-ink pt-4">
        <h3 className="text-xl font-extrabold tracking-tight text-n-ink">
          <Link href={href} className="hover:underline">
            {title}
          </Link>
        </h3>
        <p className="mt-1 text-xs text-n-slate">{note}</p>
      </div>
      {children}
      <div className="mt-4">
        <ViewAll href={href}>View the top {RANKING_PAGE_DEPTH}</ViewAll>
      </div>
    </article>
  );
}

async function creatorCard(scope: RankingScope, metric: CreatorMetric) {
  const ranking = await getCreatorRanking({ scope, metric, limit: CARD_ROWS });
  return ranking ? { scope, metric, ranking } : null;
}

export default async function RankingsHubPage() {
  const [lead, cards, platformCards, categories, games] = await Promise.all([
    getCreatorRanking({
      scope: "all-platforms",
      metric: "most-watched",
      limit: LEAD_ROWS,
    }),
    Promise.all(
      CARD_METRICS.map((metric) => creatorCard("all-platforms", metric)),
    ),
    Promise.all(
      STREAM_PLATFORMS.map((scope) => creatorCard(scope, "most-watched")),
    ),
    getCategoryRanking({ metric: "most-watched", limit: LEAD_ROWS }),
    listGameRankings(24),
  ]);
  // Nothing published yet (the worker has not run): no hub to show.
  if (!lead) notFound();

  const leadColumns = creatorColumns("most-watched");
  const rankingLinks = allCreatorRankings().map(({ scope, metric }) => ({
    name: capitalise(rankingPhrase(scope, metric)),
    url: `${SITE_URL}${rankingPath(scope, metric)}`,
  }));

  return (
    <div className="noticed">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "Streamer rankings",
            url: `${SITE_URL}${RANKINGS_PATH}`,
            description: DESCRIPTION,
            dateModified: lead.computedAt.toISOString(),
            mainEntity: {
              "@type": "ItemList",
              itemListElement: rankingLinks.map((link, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: link.name,
                url: link.url,
              })),
            },
          }),
        }}
      />
      <Container className="pb-16 pt-10 sm:pb-24 sm:pt-16">
        <header className="max-w-3xl">
          <p className="n-eyebrow mb-4 text-n-slate">Rankings</p>
          <h1 className="text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-[1.02] tracking-[-.045em] text-n-ink">
            Who is leading live streaming this month.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-n-slate">
            The most watched, fastest growing and most followed creators on
            Twitch, YouTube and Kick, with one row per creator across every
            platform they stream on. Rebuilt every day from the last 30 days.
          </p>
          <p className="mt-4 text-sm text-n-slate">
            Updated{" "}
            <time dateTime={lead.computedAt.toISOString()}>
              {rankingDay(lead.computedAt)}
            </time>
            <span aria-hidden> · </span>Data by Hatchet
          </p>
        </header>

        <section aria-labelledby="lead-title" className="mt-14 sm:mt-20">
          <SectionHeading
            number="01"
            title="Most watched creators"
            id="lead-title"
          >
            <ViewAll href={rankingPath("all-platforms", "most-watched")}>
              View the top {RANKING_PAGE_DEPTH}
            </ViewAll>
          </SectionHeading>
          <RankingTable
            caption={`Most watched streamers across every platform, ${rankingMonth(lead.windowEnd)}`}
            subject="Creator"
            columns={leadColumns}
            rankedKey="hoursWatched"
            rows={creatorTableRows(lead.rows)}
          />
        </section>

        <section aria-labelledby="more-title" className="mt-16 sm:mt-24">
          <SectionHeading
            number="02"
            title="More creator rankings"
            id="more-title"
          />
          <div className="grid gap-x-12 gap-y-14 md:grid-cols-2">
            {cards.flatMap((card) =>
              card
                ? [
                    <Card
                      key={card.metric}
                      title={metricLabel(card.metric)}
                      href={rankingPath(card.scope, card.metric)}
                      note={capitalise(
                        `${rankingPhrase(card.scope, card.metric)}, all platforms`,
                      )}
                    >
                      <RankingTable
                        caption={capitalise(
                          rankingPhrase(card.scope, card.metric),
                        )}
                        subject="Creator"
                        columns={creatorColumns(card.metric)}
                        rankedKey={creatorColumns(card.metric)[0]?.key ?? ""}
                        rows={creatorTableRows(card.ranking.rows, {
                          avatarSize: "sm",
                        })}
                        compact
                      />
                    </Card>,
                  ]
                : [],
            )}
          </div>
        </section>

        <section aria-labelledby="platform-title" className="mt-16 sm:mt-24">
          <SectionHeading number="03" title="By platform" id="platform-title" />
          <div className="grid gap-x-12 gap-y-14 lg:grid-cols-3">
            {platformCards.flatMap((card) =>
              card
                ? [
                    <Card
                      key={card.scope}
                      title={scopeLabel(card.scope)}
                      href={rankingPath(card.scope, card.metric)}
                      note={`Most watched ${scopeLabel(card.scope)} streamers`}
                    >
                      <RankingTable
                        caption={capitalise(
                          rankingPhrase(card.scope, card.metric),
                        )}
                        subject="Creator"
                        columns={creatorColumns(card.metric)}
                        rankedKey="hoursWatched"
                        rows={creatorTableRows(card.ranking.rows, {
                          avatarSize: "sm",
                          showKnownFor: false,
                        })}
                        compact
                      />
                      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-n-slate">
                        {metricsForScope(card.scope)
                          .filter((metric) => metric !== card.metric)
                          .map((metric) => (
                            <li key={metric}>
                              <Link
                                href={rankingPath(card.scope, metric)}
                                className="hover:text-n-ink hover:underline"
                              >
                                {metricLabel(metric)}
                              </Link>
                            </li>
                          ))}
                      </ul>
                    </Card>,
                  ]
                : [],
            )}
          </div>
          <div className="mt-12 border-t border-n-line pt-6">
            <h3 className="n-eyebrow mb-3 text-n-slate">
              Most followed on social platforms
            </h3>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-base">
              {SOCIAL_PLATFORMS.map((scope) => (
                <li key={scope}>
                  <Link
                    href={rankingPath(scope, "most-followed")}
                    className="font-medium text-n-ink hover:underline"
                  >
                    {capitalise(rankingPhrase(scope, "most-followed"))}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {games.length > 0 && (
          <section aria-labelledby="by-game" className="mt-16 sm:mt-24">
            <SectionHeading number="04" title="By game" id="by-game" />
            <ul className="grid grid-cols-2 gap-x-8 gap-y-3 text-base md:grid-cols-3 lg:grid-cols-4">
              {games.map((game) => (
                <li key={game.slug} className="min-w-0">
                  <Link
                    href={gameRankingPath(game.slug)}
                    className="block truncate font-medium text-n-ink hover:underline"
                  >
                    Top {game.name} streamers
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {categories && (
          <section aria-labelledby="categories" className="mt-16 sm:mt-24">
            <SectionHeading
              number={games.length > 0 ? "05" : "04"}
              title="Most watched categories"
              id="categories"
            >
              <span className="flex flex-wrap gap-x-5 gap-y-1">
                <ViewAll href={categoryRankingPath("most-watched")}>
                  View the top {RANKING_PAGE_DEPTH}
                </ViewAll>
                <ViewAll href={categoryRankingPath("most-streamed")}>
                  Most streamed
                </ViewAll>
              </span>
            </SectionHeading>
            <RankingTable
              caption={`Most watched streaming categories, ${rankingMonth(categories.windowEnd)}`}
              subject="Category"
              columns={categoryColumns("most-watched")}
              rankedKey={categoryRankedKey("most-watched")}
              rows={categoryTableRows(categories.rows)}
            />
          </section>
        )}
      </Container>
    </div>
  );
}
