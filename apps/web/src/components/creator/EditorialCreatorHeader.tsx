import Image from "next/image";
import Link from "next/link";
import { Container, ActionLink } from "@/components/ui/Editorial";
import { CreatorPortrait } from "@/components/landing/CreatorPortrait";
import { PlatformIcon, SyncStatus, InfoTip } from "@/components/shared";
import {
  PLATFORM_CONFIG,
  sortByPlatformOrder,
} from "@/lib/constants/platforms";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";
import { CREATOR_HEADER_INFO } from "@/lib/constants/metric-info";
import type { CreatorHeaderProps } from "./CreatorHeader";
import type { ReactNode } from "react";

export function EditorialCreatorHeader({
  creator,
  kit = false,
  actions,
}: {
  creator: CreatorHeaderProps["creator"];
  kit?: boolean;
  actions?: ReactNode;
}) {
  const banner = getSafeImageSrc(creator.bannerUrl);
  const managed = creator.state === "claimed" || creator.state === "premium";
  const details = [
    creator.country,
    creator.language,
    creator.age ? `${creator.age} years old` : null,
  ].filter(Boolean);
  return (
    <>
      <header className="n-dark relative overflow-hidden bg-n-ink text-white">
        {banner && (
          <div className="absolute inset-0 opacity-20">
            <Image
              src={banner}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-r from-n-ink to-transparent" />
          </div>
        )}
        <Container className="relative py-12 sm:py-16 lg:py-20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="n-eyebrow text-white/70">
              {kit ? "Creator media kit" : "Creator profile & analytics"}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {managed ? (
                <span className="text-sm text-white/80">
                  {creator.state === "premium"
                    ? "Premium profile"
                    : "Managed by the creator"}
                </span>
              ) : creator.state === "pending_claim" ? (
                <span className="text-sm text-white/80">Claim pending</span>
              ) : (
                <ActionLink href={`/claim?profile=${creator.id}`}>
                  Claim this profile
                </ActionLink>
              )}
              {actions}
            </div>
          </div>
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
            <div className="min-w-0">
              <CreatorPortrait
                src={creator.avatarUrl}
                name={creator.displayName}
                priority
                className="mb-6 h-24 w-24 sm:h-28 sm:w-28"
              />
              <h1 className="break-words text-[clamp(2.75rem,7vw,6rem)] font-extrabold leading-[.98] tracking-[-.055em]">
                {creator.displayName}
                <span className="text-n-red">.</span>
              </h1>
              {details.length > 0 && (
                <p className="mt-5 text-sm text-white/70">
                  {details.join(" · ")}
                </p>
              )}
              {creator.bio && (
                <p className="mt-5 max-w-2xl whitespace-pre-line break-words text-base leading-relaxed text-white/80 sm:text-lg">
                  {creator.bio}
                </p>
              )}
            </div>
            <div className="border-t border-white/25 pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              <p className="n-eyebrow flex items-center gap-2 text-white/70">
                Total audience{" "}
                <InfoTip info={CREATOR_HEADER_INFO.totalFollowers} />
              </p>
              <p className="mt-3 text-[clamp(3.5rem,7vw,6rem)] font-extrabold leading-none tracking-[-.06em]">
                {formatNumber(Number(creator.totalFollowers))}
              </p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
                Followers across tracked accounts. Not a unique audience count.
              </p>
              <div className="mt-6">
                <SyncStatus lastSyncedAt={creator.lastSnapshotAt} />
              </div>
              <Link
                href={
                  kit
                    ? `/creator/${creator.slug}`
                    : `/creator/${creator.slug}/media-kit`
                }
                className="mt-6 inline-block py-2 text-sm font-semibold underline underline-offset-4"
              >
                {kit
                  ? "Explore the full analytics profile"
                  : "Open the shareable media kit"}{" "}
                ↗
              </Link>
            </div>
          </div>
        </Container>
      </header>
      <div className="border-b border-n-line">
        <Container className="grid grid-cols-2 gap-x-8 gap-y-7 py-8 sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-12">
          {sortByPlatformOrder(creator.platformAccounts).map((account) => {
            const url = getPlatformProfileUrl(
              account.platform,
              account.platformUrl,
              account.platformUsername,
            );
            const contents = (
              <>
                <span className="flex items-center gap-2 text-sm text-n-slate">
                  <PlatformIcon platform={account.platform} />
                  {PLATFORM_CONFIG[account.platform].name}
                </span>
                <span className="mt-2 block text-2xl font-bold tracking-tight">
                  {account.followerCount === null
                    ? "—"
                    : formatNumber(Number(account.followerCount))}
                </span>
                <span className="mt-1 block text-xs text-n-slate">
                  {account.platform === "youtube" ? "Subscribers" : "Followers"}
                </span>
                <span className="mt-1 block truncate text-xs text-n-slate">
                  @{account.platformUsername}
                </span>
              </>
            );
            return url ? (
              <a
                key={account.platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 hover:underline"
              >
                {contents}
              </a>
            ) : (
              <div
                key={account.platform}
                className="min-w-0"
                title="External profile unavailable"
              >
                {contents}
              </div>
            );
          })}
        </Container>
      </div>
    </>
  );
}
