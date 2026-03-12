import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Prisma } from "@twitchmetrics/database";
import { db } from "@/server/db";
import { serializeBigInt } from "@/app/api/_lib/serialize";
import { formatNumber } from "@/lib/utils/format";
import { SearchBar } from "@/components/search";

type SearchPageProps = {
  searchParams: Promise<{ q?: string; type?: string }>;
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

async function searchDatabase(query: string, type: string) {
  const creators: SearchCreator[] =
    type === "games"
      ? []
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
            WHERE cp."searchText" % ${query}
               OR cp."searchText" ILIKE '%' || ${query} || '%'
            ORDER BY relevance DESC, cp."totalFollowers" DESC
            LIMIT 20
          `),
        );

  const games: SearchGame[] =
    type === "creators"
      ? []
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
            LIMIT 20
          `),
        );

  return { creators, games };
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
  const { q, type: typeParam } = await searchParams;
  const type = typeParam ?? "all";
  const query = q?.trim() ?? "";

  const hasQuery = query.length >= 2;
  const results = hasQuery ? await searchDatabase(query, type) : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-[#F2F3F5]">Search</h1>

      <SearchBar mode="full" defaultQuery={query} autoFocus={!hasQuery} />

      {/* Filter tabs */}
      {hasQuery && (
        <div className="mt-6 flex gap-1 rounded-md bg-[#1E1F22] p-0.5 w-fit">
          {TABS.map((tab) => (
            <Link
              key={tab.value}
              href={`/search?q=${encodeURIComponent(query)}&type=${tab.value}`}
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
          {results.creators.length === 0 && results.games.length === 0 && (
            <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
              <p className="text-lg font-medium text-[#DBDEE1]">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="mt-1 text-sm text-[#949BA4]">
                Try a different search term or check the spelling
              </p>
            </div>
          )}

          {results.creators.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase text-[#949BA4]">
                Creators ({results.creators.length})
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
                Games ({results.games.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.games.map((g) => (
                  <Link
                    key={g.id}
                    href={`/game/${g.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                  >
                    <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                      {g.coverImageUrl ? (
                        <Image
                          src={g.coverImageUrl}
                          alt={g.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#949BA4] bg-[#1E1F22]">
                          {g.name.charAt(0)}
                        </div>
                      )}
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
        </div>
      )}
    </div>
  );
}
