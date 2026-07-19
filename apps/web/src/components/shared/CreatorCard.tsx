import Link from "next/link";
import Image from "next/image";
import { type Platform, PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import { PlatformIcon } from "./PlatformIcon";

type CreatorCardProps = {
  creator: {
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
  /** Compact mode for use in trending lists */
  compact?: boolean;
};

function TrendIndicator({
  direction,
  delta,
  pct,
}: {
  direction: string;
  delta: string;
  pct: number;
}) {
  const deltaNum = Number(delta);
  const isUp = direction === "UP";
  const isDown = direction === "DOWN";

  const color = isUp
    ? "text-[#22c55e]"
    : isDown
      ? "text-[#ef4444]"
      : "text-[#949BA4]";
  const arrow = isUp ? "▲" : isDown ? "▼" : "–";
  const sign = isUp ? "+" : "";

  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${color}`}>
      <span className="text-[10px]">{arrow}</span>
      {sign}
      {formatNumber(deltaNum)}
      <span className="text-[#949BA4]">
        ({pct > 0 ? "+" : ""}
        {pct.toFixed(1)}%)
      </span>
    </span>
  );
}

export function CreatorCard({ creator, compact = false }: CreatorCardProps) {
  const followers = Number(creator.totalFollowers);
  const primaryConfig = PLATFORM_CONFIG[creator.primaryPlatform];
  const safeAvatarUrl = getSafeImageSrc(creator.avatarUrl);

  if (compact) {
    return (
      <Link
        href={`/creator/${creator.slug}`}
        className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-[#383A40]"
      >
        {/* Avatar */}
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
          {safeAvatarUrl ? (
            <Image
              src={safeAvatarUrl}
              alt={creator.displayName}
              fill
              className="object-cover"
              sizes="40px"
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-sm font-bold"
              style={{
                backgroundColor: primaryConfig.color,
                color: primaryConfig.foregroundColor,
              }}
            >
              {creator.displayName.charAt(0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[#DBDEE1]">
            {creator.displayName}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#949BA4]">
            {creator.growthRollup ? (
              <TrendIndicator
                direction={creator.growthRollup.trendDirection}
                delta={creator.growthRollup.delta7d}
                pct={creator.growthRollup.pct7d}
              />
            ) : (
              <span>{formatNumber(followers)} followers</span>
            )}
          </div>
        </div>

        {/* Platform logos */}
        <div className="flex items-center gap-1">
          {creator.platformAccounts.map((a) => (
            <PlatformIcon
              key={a.platform}
              platform={a.platform}
              size="xs"
              className="h-3.5 w-3.5"
            />
          ))}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/creator/${creator.slug}`}
      className="group flex h-full flex-col items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-4 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
    >
      {/* Avatar */}
      <div className="relative h-16 w-16 overflow-hidden rounded-full bg-[#383A40]">
        {safeAvatarUrl ? (
          <Image
            src={safeAvatarUrl}
            alt={creator.displayName}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-lg font-bold"
            style={{
              backgroundColor: primaryConfig.color,
              color: primaryConfig.foregroundColor,
            }}
          >
            {creator.displayName.charAt(0)}
          </div>
        )}
      </div>

      {/* Name */}
      <div className="w-full truncate text-center text-sm font-semibold text-[#F2F3F5]">
        {creator.displayName}
      </div>

      {/* Followers */}
      <div className="text-xs text-[#949BA4]">
        {formatNumber(followers)} followers
      </div>

      {/* Platform logos */}
      <div className="flex items-center gap-1.5">
        {creator.platformAccounts.map((a) => (
          <PlatformIcon
            key={a.platform}
            platform={a.platform}
            size="xs"
            className="h-3.5 w-3.5"
          />
        ))}
      </div>

      {/* Growth indicator */}
      {creator.growthRollup && (
        <TrendIndicator
          direction={creator.growthRollup.trendDirection}
          delta={creator.growthRollup.delta7d}
          pct={creator.growthRollup.pct7d}
        />
      )}
    </Link>
  );
}
