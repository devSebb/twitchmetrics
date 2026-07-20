import Link from "next/link";
import { GameController } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/Card";
import { formatNumber, formatDuration } from "@/lib/utils/format";
import { GameCoverImage } from "@/components/games/GameCoverImage";

type PopularGamesProps = {
  games: {
    name: string;
    slug: string | null;
    coverImageUrl: string | null;
    airtimeMinutes?: number;
    avgViewers?: number;
    observationCount?: number;
    measurement?: "measured" | "observed" | "mixed";
  }[];
};

const HEADING = "Popular Games · Last 30 days";

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
          {HEADING}
        </h2>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">No game data available yet</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">{HEADING}</h2>
      <Card>
        <div className="space-y-3">
          {games.slice(0, 6).map((game) => {
            const content = (
              <div className="flex items-center gap-3 rounded-md p-2">
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
                  <div className="flex gap-3 text-xs text-[#949BA4]">
                    {game.avgViewers !== undefined && (
                      <span>
                        <span className="text-[#E32C19] font-medium">AV</span>{" "}
                        {formatNumber(game.avgViewers)}
                      </span>
                    )}
                    {game.measurement === "observed" ? (
                      <span>
                        {formatNumber(game.observationCount ?? 0)} live{" "}
                        {(game.observationCount ?? 0) === 1
                          ? "observation"
                          : "observations"}
                      </span>
                    ) : game.airtimeMinutes !== undefined ? (
                      <span>
                        <span className="font-medium">AT:</span>{" "}
                        {formatDuration(game.airtimeMinutes * 60)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );

            return game.slug ? (
              <Link
                key={`${game.name}:${game.slug}`}
                href={`/game/${game.slug}`}
                className="block rounded-md transition-colors hover:bg-[#383A40]"
              >
                {content}
              </Link>
            ) : (
              <div key={game.name}>{content}</div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
