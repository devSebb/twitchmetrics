import Link from "next/link";
import {
  Container,
  SectionHeading,
  EmptyState,
} from "@/components/ui/Editorial";
import { GameCoverImage } from "@/components/games/GameCoverImage";
import { formatNumber } from "@/lib/utils/format";
import { CreatorSummary } from "./CreatorSummary";
import type { LandingCreator, LandingGame } from "./types";
export function TrendingSection({
  topChannels,
  topGames,
  trendingCreators,
}: {
  topChannels: LandingCreator[];
  topGames: LandingGame[];
  trendingCreators: LandingCreator[];
}) {
  // The two rankings sit side by side, so show the same number of rows in each.
  const rows =
    topChannels.length && topGames.length
      ? Math.min(topChannels.length, topGames.length)
      : Math.max(topChannels.length, topGames.length);
  topChannels = topChannels.slice(0, rows);
  topGames = topGames.slice(0, rows);
  return (
    <>
      <section className="py-16 sm:py-24" aria-labelledby="discovery-title">
        <Container>
          <SectionHeading
            number="03"
            title="Find your next favourite."
            id="discovery-title"
          >
            <Link
              href="/creators"
              className="text-sm font-semibold underline underline-offset-4"
            >
              Browse all channels
            </Link>
          </SectionHeading>
          <div className="mb-10 grid gap-6 sm:grid-cols-2">
            <Link
              href="/browse?vertical=gaming"
              className="group border-t-2 border-n-ink bg-n-surface p-6 sm:p-8"
            >
              <p className="n-eyebrow text-n-slate">Gaming</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight group-hover:underline">
                From the first stream to the main stage.
              </h3>
              <p className="mt-3 text-base leading-relaxed text-n-slate">
                Explore games, streams and the creators behind them.
              </p>
            </Link>
            <Link
              href="/browse?vertical=irl"
              className="group border-t-2 border-n-ink bg-n-surface p-6 sm:p-8"
            >
              <p className="n-eyebrow text-n-slate">Beyond gaming</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight group-hover:underline">
                Every interest has an audience.
              </h3>
              <p className="mt-3 text-base leading-relaxed text-n-slate">
                Start with IRL, then explore music, creative and more.
              </p>
            </Link>
          </div>
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-xl font-bold tracking-tight">
                  Popular creators
                </h3>
                <Link
                  href="/creators"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  All creators
                </Link>
              </div>
              <p className="mb-5 mt-3 text-sm text-n-slate">
                By total followers across tracked accounts
              </p>
              {topChannels.length ? (
                topChannels.map((creator) => (
                  <CreatorSummary key={creator.slug} creator={creator} />
                ))
              ) : (
                <EmptyState>
                  Creator data is not available yet. You can still search for a
                  profile.
                </EmptyState>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-xl font-bold tracking-tight">
                  What people are watching
                </h3>
                <Link
                  href="/browse"
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  All categories
                </Link>
              </div>
              <p className="mb-5 mt-3 text-sm text-n-slate">
                Latest tracked viewers and live channels
              </p>
              {topGames.length ? (
                topGames.map((game) => (
                  <Link
                    key={game.slug}
                    href={`/game/${game.slug}`}
                    className="group flex items-center gap-4 border-b border-n-line py-4 transition-colors hover:bg-n-surface"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-n-surface">
                      <GameCoverImage
                        src={game.coverImageUrl}
                        name={game.name}
                        sizes="48px"
                        className="object-cover"
                        fallbackClassName="!bg-none !bg-n-surface !text-n-slate [&>span]:hidden"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold group-hover:underline">
                        {game.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-n-slate">
                        {formatNumber(game.currentChannels)} live channels
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-base font-semibold tabular-nums">
                        {formatNumber(game.currentViewers)}
                      </span>
                      <span className="text-xs text-n-slate">viewers</span>
                    </span>
                  </Link>
                ))
              ) : (
                <EmptyState>
                  Category data is not available yet. Explore the category
                  directory.
                </EmptyState>
              )}
            </div>
          </div>
        </Container>
      </section>
      <section
        className="border-y border-n-line py-16 sm:py-20"
        aria-labelledby="trending-title"
      >
        <Container>
          <SectionHeading
            number="04"
            title="More creators making moves."
            id="trending-title"
          >
            <Link
              href="/creators?sort=trending"
              className="text-sm font-semibold underline underline-offset-4"
            >
              View all trending
            </Link>
          </SectionHeading>
          <p className="mb-7 text-sm text-n-slate">
            Continuing the trending selection above. Follower changes cover the
            last 7 days on each creator’s primary platform.
          </p>
          {trendingCreators.length ? (
            <div className="grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">
              {trendingCreators.map((creator) => (
                <CreatorSummary key={creator.slug} creator={creator} growth />
              ))}
            </div>
          ) : (
            <EmptyState>
              No additional trending creators are available for this period.
            </EmptyState>
          )}
        </Container>
      </section>
    </>
  );
}
