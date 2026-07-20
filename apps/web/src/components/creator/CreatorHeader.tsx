import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { Platform, ProfileState } from "@twitchmetrics/database";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import { getSafePlatformProfileUrl } from "@/lib/platform-profile-url";
import { PlatformIcon, SyncStatus } from "@/components/shared";

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
    language: string | null;
    age: number | null;
    state: ProfileState;
    primaryPlatform: Platform;
    totalFollowers: string;
    lastSnapshotAt: string | null;
    platformAccounts: PlatformAccountData[];
    growthRollups: GrowthRollupData[];
  };
  /** Owner-only action buttons (e.g. Customize, Share URL) rendered in the top-right corner. */
  ownerActions?: React.ReactNode;
  /** Hide the public-trust status badge (used on the owner's own dashboard, where it's tautological). */
  hideStatusBadge?: boolean;
  /** Profile-completion percentage (0-100). When provided AND below 100, a thin inline progress bar is shown next to the name. */
  completionPct?: number;
};

function getFollowerLabel(platform: Platform): string {
  if (platform === "youtube") return "Subscribers";
  return "Followers";
}

function PlatformAccountStat({ account }: { account: PlatformAccountData }) {
  const profileUrl = getSafePlatformProfileUrl(
    account.platform,
    account.platformUrl,
  );
  const content = (
    <>
      <PlatformIcon platform={account.platform} size="lg" rounded="none" />
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
    </>
  );

  if (!profileUrl) {
    return (
      <div
        role="group"
        aria-label={`${account.platform} external profile unavailable`}
        className="flex items-center gap-2.5"
        title="External profile unavailable"
      >
        {content}
      </div>
    );
  }

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2.5 transition-opacity hover:opacity-80 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]"
    >
      {content}
    </a>
  );
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

export function CreatorHeader({
  creator,
  ownerActions,
  hideStatusBadge = false,
  completionPct,
}: CreatorHeaderProps) {
  const totalFollowers = Number(creator.totalFollowers);
  const safeAvatarUrl = getSafeImageSrc(creator.avatarUrl);
  const metaItems = [
    creator.country,
    creator.language,
    creator.age ? `${creator.age} years old` : null,
  ].filter((item): item is string => Boolean(item));
  const showCompletion =
    typeof completionPct === "number" && completionPct < 100;
  const cornerHasContent = Boolean(ownerActions) || !hideStatusBadge;

  return (
    <div className="overflow-hidden rounded-xl border border-[#3F4147] bg-[#313338]">
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-5">
        {/* Avatar */}
        <div className="flex-shrink-0 self-center">
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
          {/* Top row: name (with optional completion bar) + corner actions */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-display text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
                {creator.displayName}
              </h1>
              {showCompletion && (
                <div
                  className="flex items-center gap-2"
                  title={`Profile ${completionPct}% complete`}
                >
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#383A40]">
                    <div
                      className="h-full rounded-full bg-[#E32C19] transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-[#949BA4]">
                    {completionPct}%
                  </span>
                </div>
              )}
            </div>
            {cornerHasContent && (
              <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                {ownerActions}
                {!hideStatusBadge && (
                  <ClaimStatus state={creator.state} creatorId={creator.id} />
                )}
              </div>
            )}
          </div>

          {/* Meta row: country, language, age */}
          {metaItems.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#B5BAC1]">
              {metaItems.map((item, index) => (
                <span key={item} className="flex items-center gap-2">
                  {index > 0 && (
                    <span className="text-[#6B7280]" aria-hidden>
                      |
                    </span>
                  )}
                  <span>{item}</span>
                </span>
              ))}
            </div>
          )}

          {/* Bio */}
          {creator.bio && (
            <p className="mb-4 max-w-2xl text-sm leading-relaxed text-[#B5BAC1]">
              {creator.bio}
            </p>
          )}

          {/* Total Followers + Platform row */}
          <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-8">
            {/* Total stat */}
            <div className="flex-shrink-0">
              <div className="text-3xl font-bold tracking-tight text-[#F2F3F5]">
                {formatNumber(totalFollowers)}
              </div>
              <div className="text-xs font-medium tracking-wide text-[#949BA4] uppercase">
                Total Followers
              </div>
            </div>

            {/* Platform breakdown */}
            <div className="flex flex-wrap items-end gap-5 lg:gap-6">
              {creator.platformAccounts.map((account) => (
                <PlatformAccountStat key={account.platform} account={account} />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <SyncStatus lastSyncedAt={creator.lastSnapshotAt} />
          </div>
        </div>
      </div>
    </div>
  );
}
