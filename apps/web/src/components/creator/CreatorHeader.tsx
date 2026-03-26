import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import type { Platform, ProfileState } from "@twitchmetrics/database";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import { PlatformIcon } from "@/components/shared";

type PlatformAccountData = {
  platform: Platform;
  platformUsername: string;
  platformUrl: string | null;
  followerCount: string | null;
  totalViews: string | null;
  postCount: number | null;
};

type GrowthRollupData = {
  platform: Platform;
  delta7d: string;
  pct7d: number;
  trendDirection: string;
};

type CreatorHeaderProps = {
  creator: {
    id: string;
    displayName: string;
    slug: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    bio: string | null;
    country: string | null;
    state: ProfileState;
    primaryPlatform: Platform;
    totalFollowers: string;
    lastSnapshotAt: string | null;
    platformAccounts: PlatformAccountData[];
    growthRollups: GrowthRollupData[];
  };
};

function getFollowerLabel(platform: Platform): string {
  if (platform === "youtube") return "Subscribers";
  return "Followers";
}

function ClaimStatus({
  state,
  creatorId,
}: {
  state: ProfileState;
  creatorId: string;
}) {
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
        <Link href={`/claim?profile=${creatorId}`}>
          <Button variant="primary" size="sm">
            Claim This Profile
          </Button>
        </Link>
      );
  }
}

export function CreatorHeader({ creator }: CreatorHeaderProps) {
  const totalFollowers = Number(creator.totalFollowers);
  const safeAvatarUrl = getSafeImageSrc(creator.avatarUrl);

  return (
    <div className="overflow-hidden rounded-xl border border-[#3F4147] bg-[#313338]">
      <div className="flex flex-col sm:flex-row sm:items-start gap-5 p-5 sm:p-6">
        {/* Avatar */}
        <div className="flex-shrink-0 self-center sm:self-start">
          <div className="h-28 w-28 overflow-hidden rounded-full border-3 border-[#3F4147] bg-[#383A40] sm:h-32 sm:w-32">
            {safeAvatarUrl ? (
              <Image
                src={safeAvatarUrl}
                alt={creator.displayName}
                width={128}
                height={128}
                className="h-full w-full object-cover"
                priority
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-[#949BA4]">
                {creator.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Top row: name + claim status */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
            <h1 className="font-display text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
              {creator.displayName}
            </h1>
            <div className="flex-shrink-0">
              <ClaimStatus state={creator.state} creatorId={creator.id} />
            </div>
          </div>

          {/* Meta row: country */}
          {creator.country && (
            <div className="mb-2 flex items-center gap-1.5 text-sm text-[#B5BAC1]">
              <span>{creator.country}</span>
            </div>
          )}

          {/* Bio */}
          {creator.bio && (
            <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[#B5BAC1]">
              {creator.bio}
            </p>
          )}

          {/* Total Connections + Platform row */}
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-8">
            {/* Total stat */}
            <div className="flex-shrink-0">
              <div className="text-3xl font-bold tracking-tight text-[#F2F3F5]">
                {formatNumber(totalFollowers)}
              </div>
              <div className="text-xs font-medium tracking-wide text-[#949BA4] uppercase">
                Total Connections
              </div>
            </div>

            {/* Platform breakdown */}
            <div className="flex flex-wrap items-end gap-5 lg:gap-6">
              {creator.platformAccounts.map((account) => {
                const config = PLATFORM_CONFIG[account.platform];
                return (
                  <a
                    key={account.platform}
                    href={account.platformUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
                  >
                    {/* Circular colored icon */}
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full shadow-sm"
                      style={{ backgroundColor: config.color }}
                    >
                      <PlatformIcon
                        platform={account.platform}
                        size="sm"
                        className="brightness-0 invert"
                      />
                    </div>
                    {/* Count + label */}
                    <div className="flex flex-col">
                      <span className="text-base font-bold leading-tight text-[#F2F3F5]">
                        {account.followerCount
                          ? formatNumber(Number(account.followerCount))
                          : "—"}
                      </span>
                      <span className="text-[11px] font-medium text-[#949BA4]">
                        {getFollowerLabel(account.platform)}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
