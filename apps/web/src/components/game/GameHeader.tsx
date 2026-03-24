import Image from "next/image";
import { formatNumber } from "@/lib/utils/format";

type GameHeaderProps = {
  game: {
    name: string;
    slug: string;
    coverImageUrl: string | null;
    developer: string | null;
    publisher: string | null;
    releaseDate: string | null;
    currentViewers: number;
    currentChannels: number;
    peakViewers24h: number;
    avgViewers7d: number;
    avgLiveChannels: number;
  };
};

// Platform dot colors: Twitch, YouTube, Kick
const PLATFORM_DOTS = ["#9146ff", "#ff0000", "#53fc18"];

function PlatformDots() {
  return (
    <div className="mt-1 flex gap-1">
      {PLATFORM_DOTS.map((color) => (
        <span
          key={color}
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function LargeStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-lg border border-[#3F4147] bg-[#313338] px-5 py-4">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#949BA4]">
        {label}
      </span>
      <span className="mt-1 text-2xl font-bold text-[#F2F3F5]">
        {formatNumber(value)}
      </span>
      <PlatformDots />
    </div>
  );
}

function SmallStatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col rounded-lg border border-[#3F4147] bg-[#313338] px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-[#949BA4]">
        {label}
      </span>
      <span className="mt-1 text-xl font-bold text-[#F2F3F5]">
        {formatNumber(value)}
      </span>
      <PlatformDots />
    </div>
  );
}

export function GameHeader({ game }: GameHeaderProps) {
  return (
    <div>
      {/* Top row: cover art + metadata + 2 large KPIs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
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

        {/* Metadata */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[#F2F3F5]">{game.name}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#949BA4]">
            {game.developer && (
              <span>
                <span className="text-[#949BA4]">Developer:</span>{" "}
                <span className="font-medium text-[#DBDEE1]">
                  {game.developer}
                </span>
              </span>
            )}
            {game.releaseDate && (
              <span>
                <span className="text-[#949BA4]">Released:</span>{" "}
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
        </div>

        {/* 2 Large KPI cards */}
        <div className="flex gap-3 sm:flex-shrink-0">
          <LargeStatCard label="Avg Viewers (7d)" value={game.avgViewers7d} />
          <LargeStatCard
            label="Peak Viewers (24h)"
            value={game.peakViewers24h}
          />
        </div>
      </div>

      {/* Bottom row: 3 smaller KPI cards */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <SmallStatCard label="Live Viewers" value={game.currentViewers} />
        <SmallStatCard label="Live Channels" value={game.currentChannels} />
        <SmallStatCard label="Avg Live Channels" value={game.avgLiveChannels} />
      </div>
    </div>
  );
}
