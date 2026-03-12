import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatNumber } from "@/lib/utils/format";

type GameHeaderProps = {
  game: {
    name: string;
    slug: string;
    coverImageUrl: string | null;
    genres: string[];
    developer: string | null;
    publisher: string | null;
    releaseDate: string | null;
    currentViewers: number;
    currentChannels: number;
    peakViewers24h: number;
    avgViewers7d: number;
  };
};

const STATS = [
  { label: "Live Viewers", key: "currentViewers" },
  { label: "Live Channels", key: "currentChannels" },
  { label: "Peak Viewers (24h)", key: "peakViewers24h" },
  { label: "Avg Viewers (7d)", key: "avgViewers7d" },
] as const;

export function GameHeader({ game }: GameHeaderProps) {
  return (
    <div>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Cover Art */}
        <div className="relative h-48 w-36 flex-shrink-0 overflow-hidden rounded-lg bg-[#383A40] sm:h-52 sm:w-40">
          {game.coverImageUrl ? (
            <Image
              src={game.coverImageUrl}
              alt={game.name}
              fill
              className="object-cover"
              sizes="160px"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#E32C19]/30 to-[#1E1F22]">
              <span className="text-3xl font-bold text-[#949BA4]">
                {game.name.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[#F2F3F5]">{game.name}</h1>

          {/* Meta info */}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#949BA4]">
            {game.developer && (
              <span>
                <span className="text-[#949BA4]">Developed by:</span>{" "}
                <span className="font-medium text-[#DBDEE1]">
                  {game.developer}
                </span>
              </span>
            )}
            {game.publisher && (
              <span>
                <span className="text-[#949BA4]">Published by:</span>{" "}
                <span className="font-medium text-[#DBDEE1]">
                  {game.publisher}
                </span>
              </span>
            )}
            {game.releaseDate && (
              <span>
                <span className="text-[#949BA4]">Release Date:</span>{" "}
                <span className="font-medium text-[#DBDEE1]">
                  {new Date(game.releaseDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </span>
            )}
          </div>

          {/* Genre tags */}
          {game.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {game.genres.map((genre) => (
                <Badge key={genre} variant="outline">
                  {genre}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((stat) => {
          const value = game[stat.key];
          return (
            <Card
              key={stat.key}
              className="flex flex-col items-center justify-center py-4"
            >
              <span className="text-2xl font-bold text-[#F2F3F5]">
                {formatNumber(value)}
              </span>
              <span className="mt-1 text-xs text-[#949BA4]">{stat.label}</span>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
