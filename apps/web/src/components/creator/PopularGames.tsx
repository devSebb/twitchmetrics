import Link from "next/link";
import { GameController } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";
import { formatNumber, formatDuration } from "@/lib/utils/format";
import { GameCoverImage } from "@/components/games/GameCoverImage";

type PopularGamesProps = {
  games: {
    name: string;
    slug: string;
    coverImageUrl: string | null;
    hoursStreamed?: number;
    avgViewers?: number;
  }[];
};

export function PopularGames({ games }: PopularGamesProps) {
  if (games.length === 0) {
    return (
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#F2F3F5]">
          <GameController
            size={20}
            weight="duotone"
            className="text-[#949BA4]"
          />
          Popular Games
        </h2>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">No game data available yet</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">Popular Games</h2>
      <Card>
        <div className="space-y-3">
          {games.slice(0, 6).map((game) => (
            <Link
              key={game.slug}
              href={`/game/${game.slug}`}
              className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-[#383A40]"
            >
              {/* Cover art */}
              <div className="relative h-12 w-9 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                <GameCoverImage
                  src={game.coverImageUrl}
                  name={game.name}
                  sizes="36px"
                  className="object-cover"
                  fallbackClassName="[&>span]:hidden"
                />
              </div>

              {/* Game info */}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#DBDEE1]">
                  {game.name}
                </div>
                <div className="flex gap-3 text-xs text-[#949BA4]">
                  {game.avgViewers !== undefined && (
                    <span>
                      <span className="text-[#E32C19] font-medium">AV</span>{" "}
                      {formatNumber(game.avgViewers)}
                    </span>
                  )}
                  {game.hoursStreamed !== undefined && (
                    <span>
                      <span className="font-medium">AT:</span>{" "}
                      {formatDuration(game.hoursStreamed * 3600)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
