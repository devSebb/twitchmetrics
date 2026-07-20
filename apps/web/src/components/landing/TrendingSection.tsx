import Link from "next/link";
import {
  Television,
  GameController,
  TrendUp,
} from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";
import { CreatorCard } from "@/components/shared/CreatorCard";
import { formatNumber } from "@/lib/utils/format";
import { GameCoverImage } from "@/components/games/GameCoverImage";
import type { Platform } from "@/lib/constants/platforms";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

type TopChannel = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
};

type TopGame = {
  name: string;
  slug: string;
  coverImageUrl: string | null;
  currentViewers: number;
  currentChannels: number;
};

type TrendingCreator = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  primaryPlatform: Platform;
  platformAccounts: { platform: Platform; platformUsername: string }[];
  growthRollup: {
    delta7d: string;
    pct7d: number;
    trendDirection: string;
  } | null;
};

type TrendingSectionProps = {
  topChannels: TopChannel[];
  topGames: TopGame[];
  trendingCreators: TrendingCreator[];
};

export function TrendingSection({
  topChannels,
  topGames,
  trendingCreators,
}: TrendingSectionProps) {
  return (
    <section className="bg-[#2B2D31] py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-[#F2F3F5]">
            Discover What&apos;s Trending
          </h2>
          <p className="mt-3 text-[#949BA4]">
            Spot opportunities early and understand what audiences are watching
            in the latest data.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {/* Top Channels */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-[#F2F3F5]">
                <Television
                  size={16}
                  weight="duotone"
                  className="text-[#949BA4]"
                />
                Top Channels
              </h3>
              <Link
                href="/creators"
                className="text-xs text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
              >
                View All →
              </Link>
            </div>
            <div className="space-y-1">
              {topChannels.map((creator) => (
                <CreatorCard key={creator.slug} creator={creator} compact />
              ))}
            </div>
          </Card>

          {/* Top Games */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-bold text-[#F2F3F5]">
                <GameController
                  size={16}
                  weight="duotone"
                  className="text-[#949BA4]"
                />
                Top Games
              </h3>
              <Link
                href="/browse"
                className="text-xs text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
              >
                View All →
              </Link>
            </div>
            <div className="space-y-1">
              {topGames.map((game) => (
                <Link
                  key={game.slug}
                  href={`/game/${game.slug}`}
                  className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-[#383A40]"
                >
                  <div className="relative h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                    <GameCoverImage
                      src={game.coverImageUrl}
                      name={game.name}
                      sizes="36px"
                      className="object-cover"
                      fallbackClassName="[&>span]:hidden"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#DBDEE1]">
                      {game.name}
                    </div>
                    <div className="text-xs text-[#949BA4]">
                      <span className="font-medium text-[#E32C19]">
                        {formatNumber(game.currentViewers)}
                      </span>{" "}
                      viewers · {formatNumber(game.currentChannels)} channels
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* Trending Creators - full width */}
        <Card className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-[#E32C19]">
              <TrendUp size={16} weight="duotone" className="text-[#E32C19]" />
              Trending Creators
            </h3>
            <Link
              href="/creators?sort=trending"
              className="text-xs text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
            >
              View All →
            </Link>
          </div>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {trendingCreators.map((creator) => (
              <CreatorCard key={creator.slug} creator={creator} compact />
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
