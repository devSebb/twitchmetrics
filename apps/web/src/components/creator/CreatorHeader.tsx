import Image from "next/image";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/charts";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import type { Platform, ProfileState } from "@twitchmetrics/database";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";

type PlatformAccountData = {
  platform: Platform;
  platformUsername: string;
  platformUrl: string | null;
  followerCount: string | null;
};

type GrowthRollupData = {
  platform: Platform;
  delta7d: string;
  pct7d: number;
  trendDirection: string;
};

type CreatorHeaderProps = {
  creator: {
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    bio: string | null;
    country: string | null;
    state: ProfileState;
    primaryPlatform: Platform;
    totalFollowers: string;
    platformAccounts: PlatformAccountData[];
    growthRollups: GrowthRollupData[];
  };
};

function TrendArrow({ direction }: { direction: string }) {
  if (direction === "UP") {
    return <span className="text-[#22c55e]">&#9650;</span>;
  }
  if (direction === "DOWN") {
    return <span className="text-[#ef4444]">&#9660;</span>;
  }
  return <span className="text-[#949BA4]">&#8211;</span>;
}

function ClaimStatus({ state }: { state: ProfileState }) {
  switch (state) {
    case "claimed":
      return (
        <Badge variant="status" status="claimed">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
          </svg>
          Managed by Creator
        </Badge>
      );
    case "premium":
      return (
        <Badge variant="status" status="premium">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
          </svg>
          Premium Profile
        </Badge>
      );
    case "pending_claim":
      return (
        <Badge variant="status" status="pending_claim">
          Claim Pending
        </Badge>
      );
    default:
      return (
        <Button variant="primary" size="sm">
          Claim This Profile
        </Button>
      );
  }
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const config = PLATFORM_CONFIG[platform];
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: config.color || "#383A40" }}
      title={config.name}
    >
      {config.name.charAt(0)}
    </span>
  );
}

export function CreatorHeader({ creator }: CreatorHeaderProps) {
  const totalFollowers = Number(creator.totalFollowers);
  const safeBannerUrl = getSafeImageSrc(creator.bannerUrl);
  const safeAvatarUrl = getSafeImageSrc(creator.avatarUrl);

  return (
    <div>
      {/* Banner */}
      <div className="relative h-36 overflow-hidden rounded-t-lg bg-gradient-to-r from-[#E32C19]/60 via-[#383A40] to-[#1E1F22] sm:h-44">
        {safeBannerUrl && (
          <Image
            src={safeBannerUrl}
            alt=""
            fill
            className="object-cover"
            priority
          />
        )}
      </div>

      {/* Profile info section */}
      <div className="relative border-x border-b border-[#3F4147] bg-[#313338] px-4 pb-5 sm:px-6">
        {/* Avatar */}
        <div className="relative -mt-12 mb-3 flex items-end justify-between sm:-mt-14">
          <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-[#313338] bg-[#383A40] sm:h-28 sm:w-28">
            {safeAvatarUrl ? (
              <Image
                src={safeAvatarUrl}
                alt={creator.displayName}
                width={112}
                height={112}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-[#949BA4]">
                {creator.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pb-1">
            <ClaimStatus state={creator.state} />
          </div>
        </div>

        {/* Name + meta */}
        <div className="mb-3">
          <h1 className="font-display text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
            {creator.displayName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[#949BA4]">
            {creator.country && <span>{creator.country}</span>}
          </div>
        </div>

        {/* Bio */}
        {creator.bio && (
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[#949BA4]">
            {creator.bio}
          </p>
        )}

        {/* Total followers hero stat */}
        <div className="mb-4">
          <div className="text-3xl font-bold text-[#F2F3F5]">
            {formatNumber(totalFollowers)}
          </div>
          <div className="text-sm text-[#949BA4]">Total Connections</div>
        </div>

        {/* Platform badges */}
        <div className="mb-4 flex flex-wrap gap-2">
          {creator.platformAccounts.map((account) => (
            <a
              key={account.platform}
              href={account.platformUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              <Badge variant="platform" platform={account.platform}>
                <PlatformIcon platform={account.platform} />
                {account.followerCount
                  ? formatNumber(Number(account.followerCount))
                  : "—"}
              </Badge>
            </a>
          ))}
        </div>
      </div>

      {/* Stats row heading */}
      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#949BA4]">
          <span className="text-[#F2F3F5]">{creator.slug}</span> stats{" "}
          <span className="text-[#949BA4]">Last 30 Days</span>
        </h2>
      </div>

      {/* KPI stat cards per platform */}
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {creator.platformAccounts.map((account) => {
          const growth = creator.growthRollups.find(
            (g) => g.platform === account.platform,
          );
          const config = PLATFORM_CONFIG[account.platform];
          const delta = growth ? Number(growth.delta7d) : 0;
          const pct = growth ? growth.pct7d : 0;
          const direction = growth?.trendDirection ?? "FLAT";

          return (
            <Card key={account.platform} className="p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <PlatformIcon platform={account.platform} />
                <span className="text-xs font-medium text-[#949BA4]">
                  {config.name}
                </span>
              </div>
              <div className="text-lg font-bold text-[#F2F3F5]">
                {account.followerCount
                  ? formatNumber(Number(account.followerCount))
                  : "—"}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs">
                <TrendArrow direction={direction} />
                <span
                  className={
                    direction === "UP"
                      ? "text-[#22c55e]"
                      : direction === "DOWN"
                        ? "text-[#ef4444]"
                        : "text-[#949BA4]"
                  }
                >
                  {formatPercent(pct)}
                </span>
              </div>
              <div className="mt-1">
                <Sparkline
                  data={
                    delta !== 0
                      ? [
                          0,
                          delta * 0.3,
                          delta * 0.5,
                          delta * 0.7,
                          delta * 0.85,
                          delta * 0.95,
                          delta,
                        ]
                      : []
                  }
                  trend={
                    direction === "UP"
                      ? "up"
                      : direction === "DOWN"
                        ? "down"
                        : "flat"
                  }
                  width={80}
                  height={28}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
