import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { SearchBar } from "@/components/search";
import { GameCoverImage } from "@/components/games/GameCoverImage";
import {
  buildSearchUrl,
  getSearchScopes,
  normalizeSearchType,
  type SearchType,
} from "@/lib/search";
import { LOOKUP_CREATOR_SQL } from "@/server/services/creator-visibility";

const RESULTS_PER_PAGE = 20;

type SearchPageProps = {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
};

type SearchCreator = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  relevance: number;
};

type SearchGame = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  currentViewers: number;
  relevance: number;
};

type UntrackedCreator = {
  platformUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isLive: boolean | null;
};

async function searchDatabase(query: string, type: SearchType, page: number) {
  const offset = (page - 1) * RESULTS_PER_PAGE;
  const scopes = getSearchScopes(type);

  const [creators, games, creatorCountResult, gameCountResult] =
    await Promise.all([
      !scopes.creators
        ? ([] as SearchCreator[])
        : serializeBigInt(
            await db.$queryRaw<SearchCreator[]>(Prisma.sql`
              SELECT
                cp.id,
                cp."displayName",
                cp.slug,
                cp."avatarUrl",
                cp."totalFollowers",
                similarity(cp."searchText", ${query}) AS relevance
              FROM "CreatorProfile" cp
              WHERE ${LOOKUP_CREATOR_SQL}
                AND (
                  cp."searchText" % ${query}
                  OR cp."searchText" ILIKE '%' || ${query} || '%'
                )
              ORDER BY relevance DESC, cp."totalFollowers" DESC
              LIMIT ${RESULTS_PER_PAGE} OFFSET ${offset}
            `),
          ),

      !scopes.games
        ? ([] as SearchGame[])
        : serializeBigInt(
            await db.$queryRaw<SearchGame[]>(Prisma.sql`
              SELECT
                g.id,
                g.name,
                g.slug,
                g."coverImageUrl",
                g."currentViewers",
                similarity(g."searchText", ${query}) AS relevance
              FROM "Game" g
              WHERE g."searchText" % ${query}
                 OR g."searchText" ILIKE '%' || ${query} || '%'
              ORDER BY relevance DESC, g."currentViewers" DESC
              LIMIT ${RESULTS_PER_PAGE} OFFSET ${offset}
            `),
          ),

      !scopes.creators
        ? Promise.resolve([{ count: 0 }] as { count: number }[])
        : db.$queryRaw<{ count: number }[]>(Prisma.sql`
            SELECT COUNT(*)::int AS count
            FROM "CreatorProfile" cp
            WHERE ${LOOKUP_CREATOR_SQL}
              AND (
                cp."searchText" % ${query}
                OR cp."searchText" ILIKE '%' || ${query} || '%'
              )
          `),

      !scopes.games
        ? Promise.resolve([{ count: 0 }] as { count: number }[])
        : db.$queryRaw<{ count: number }[]>(Prisma.sql`
            SELECT COUNT(*)::int AS count
            FROM "Game" g
            WHERE g."searchText" % ${query}
               OR g."searchText" ILIKE '%' || ${query} || '%'
          `),
    ]);

  const creatorTotal = Number(creatorCountResult[0]?.count ?? 0);
  const gameTotal = Number(gameCountResult[0]?.count ?? 0);

  // Fallback: if no creator matches, surface live Twitch search results so
  // users searching for famous streamers we haven't ingested yet still get
  // something — with a CTA link pointing at Twitch.
  let untrackedCreators: UntrackedCreator[] = [];
  if (scopes.creators && creators.length === 0 && page === 1) {
    try {
      const { twitchAdapter } = await import("@/server/adapters/twitch");
      const results = await twitchAdapter.search(query, 5);
      untrackedCreators = results.map((r) => ({
        platformUserId: r.platformUserId,
        username: r.platformUsername,
        displayName: r.platformDisplayName,
        avatarUrl: r.platformAvatarUrl,
        isLive: r.isLive,
      }));
    } catch {
      // Non-blocking
    }
  }

  return { creators, games, creatorTotal, gameTotal, untrackedCreators };
}

const TABS = [
  { label: "All", value: "all" },
  { label: "Creators", value: "creators" },
  { label: "Games", value: "games" },
] as const;

export async function generateMetadata({
  searchParams,
}: SearchPageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const title = q ? `Search: ${q}` : "Search";
  const description = q
    ? `Search results for "${q}" — find creators and games on TwitchMetrics.`
    : "Search for creators and games across Twitch, YouTube, and more.";

  return {
    title,
    description,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, type: typeParam, page: pageParam } = await searchParams;
  const type = normalizeSearchType(typeParam);
  const query = q?.trim() ?? "";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const hasQuery = query.length >= 2;
  const results = hasQuery ? await searchDatabase(query, type, page) : null;

  const creatorPages = results
    ? Math.ceil(results.creatorTotal / RESULTS_PER_PAGE)
    : 0;
  const gamePages = results
    ? Math.ceil(results.gameTotal / RESULTS_PER_PAGE)
    : 0;
  const totalPages = Math.max(creatorPages, gamePages, 1);

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    params.set("q", query);
    if (type !== "all") params.set("type", type);
    if (p > 1) params.set("page", String(p));
    return `/search?${params.toString()}`;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-[#F2F3F5]">Search</h1>

      <SearchBar
        mode="full"
        defaultQuery={query}
        autoFocus={!hasQuery}
        searchType={type}
      />

      {/* Filter tabs */}
      {hasQuery && (
        <div className="mt-6 flex gap-1 rounded-md bg-[#1E1F22] p-0.5 w-fit">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={buildSearchUrl(query, tab.value)}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${
                type === tab.value
                  ? "bg-[#383A40] text-[#F2F3F5]"
                  : "text-[#949BA4] hover:text-[#DBDEE1]"
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}

      {/* Server-rendered results */}
      {results && (
        <div className="mt-6">
          {results.creators.length === 0 &&
            results.games.length === 0 &&
            results.untrackedCreators.length === 0 && (
              <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
                <p className="text-lg font-medium text-[#DBDEE1]">
                  No results for &ldquo;{query}&rdquo;
                </p>
                <p className="mt-1 text-sm text-[#949BA4]">
                  Try a different search term or check the spelling
                </p>
              </div>
            )}

          {/* Untracked Twitch suggestions — shown when we have no DB match */}
          {results.creators.length === 0 &&
            results.untrackedCreators.length > 0 && (
              <div className="mb-8">
                <h2 className="mb-1 text-sm font-semibold uppercase text-[#949BA4]">
                  On Twitch — not tracked yet
                </h2>
                <p className="mb-3 text-xs text-[#72767D]">
                  These channels match your search but we haven&apos;t indexed
                  them yet. Check back after our next refresh.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {results.untrackedCreators.map((c) => (
                    <a
                      key={c.platformUserId}
                      href={`https://twitch.tv/${c.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border border-dashed border-[#3F4147] bg-[#2B2D31] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#313338]"
                    >
                      <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                        {c.avatarUrl ? (
                          <Image
                            src={c.avatarUrl}
                            alt={c.displayName}
                            fill
                            className="object-cover"
                            sizes="40px"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white bg-[#9146ff]">
                            {c.displayName.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-[#DBDEE1]">
                            {c.displayName}
                          </span>
                          {c.isLive && (
                            <span className="flex-shrink-0 rounded bg-[#E32C19] px-1 py-0.5 text-[9px] font-bold text-white">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#72767D]">
                          @{c.username} · on twitch.tv ↗
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          {results.creators.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase text-[#949BA4]">
                Creators ({results.creatorTotal})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.creators.map((c) => (
                  <Link
                    key={c.id}
                    href={`/creator/${c.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                      {c.avatarUrl ? (
                        <Image
                          src={c.avatarUrl}
                          alt={c.displayName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white bg-[#9146ff]">
                          {c.displayName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#DBDEE1]">
                        {c.displayName}
                      </div>
                      <div className="text-xs text-[#949BA4]">
                        {formatNumber(Number(c.totalFollowers))} followers
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {results.games.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-[#949BA4]">
                Games ({results.gameTotal})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.games.map((g) => (
                  <Link
                    key={g.id}
                    href={`/game/${g.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                  >
                    <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                      <GameCoverImage
                        src={g.coverImageUrl}
                        name={g.name}
                        sizes="56px"
                        className="object-cover"
                        fallbackClassName="[&>span]:hidden"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#DBDEE1]">
                        {g.name}
                      </div>
                      <div className="text-xs text-[#949BA4]">
                        {formatNumber(g.currentViewers)} viewers
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-3">
              {page > 1 ? (
                <Link
                  href={pageUrl(page - 1)}
                  className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] opacity-40 pointer-events-none">
                  Previous
                </span>
              )}
              <span className="text-sm text-[#949BA4]">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={pageUrl(page + 1)}
                  className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md bg-[#383A40] px-4 py-2 text-sm font-medium text-[#DBDEE1] opacity-40 pointer-events-none">
                  Next
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
