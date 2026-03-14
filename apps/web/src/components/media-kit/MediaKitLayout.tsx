"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PLATFORM_CONFIG, type Platform } from "@/lib/constants/platforms";
import { formatNumber, formatPercent, formatDate } from "@/lib/utils/format";
import { Badge, Button, Card } from "@/components/ui";
import { getSafeImageSrc } from "@/lib/safeImage";

type PlatformAccount = {
  platform: Platform;
  platformUsername: string;
  platformUrl: string | null;
  followerCount: string;
  totalViews: string;
};

type GrowthRollup = {
  platform: Platform;
  followerCount: string;
  delta30d: string;
  pct30d: number | null;
  trendDirection: string | null;
};

type Partnership = {
  brandName: string;
  brandLogoUrl: string | null;
  campaignName: string | null;
};

type ProfileData = {
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  country: string | null;
  state: string;
  totalFollowers: string;
  totalViews: string;
  platformAccounts: PlatformAccount[];
  growthRollups: GrowthRollup[];
  partnerships: Partnership[];
};

type AnalyticsData = {
  ageGenderData: unknown;
  countryData: unknown;
} | null;

type MediaKitLayoutProps = {
  profile: ProfileData;
  analytics: AnalyticsData;
};

function TrendArrow({ direction }: { direction: string | null }) {
  if (direction === "up") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#22c55e"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#949BA4"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
    </svg>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const config = PLATFORM_CONFIG[platform];
  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-lg"
      style={{ backgroundColor: config.color }}
    >
      <span className="text-xs font-bold text-white">
        {config.name.charAt(0)}
      </span>
    </div>
  );
}

export function MediaKitLayout({ profile, analytics }: MediaKitLayoutProps) {
  const [copied, setCopied] = useState(false);
  const isClaimed = profile.state === "claimed" || profile.state === "premium";
  const avatarSrc = getSafeImageSrc(profile.avatarUrl);
  const bannerSrc = getSafeImageSrc(profile.bannerUrl);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: do nothing
    }
  };

  const growthByPlatform = new Map(
    profile.growthRollups.map((g) => [g.platform, g]),
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Hero Section */}
      <Card className="relative overflow-hidden p-0">
        {bannerSrc ? (
          <div className="relative h-40 w-full sm:h-48">
            <Image
              src={bannerSrc}
              alt=""
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#313338]" />
          </div>
        ) : (
          <div className="h-24 w-full bg-gradient-to-r from-[#E32C19]/30 via-[#313338] to-[#9146ff]/30" />
        )}

        <div
          className={cn("relative px-6 pb-6", bannerSrc ? "-mt-12" : "-mt-4")}
        >
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            {avatarSrc ? (
              <Image
                src={avatarSrc}
                alt={profile.displayName}
                width={96}
                height={96}
                className="rounded-full border-4 border-[#313338] shadow-lg"
                priority
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#313338] bg-[#383A40] text-2xl font-bold text-[#F2F3F5]">
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-bold text-[#F2F3F5] sm:text-3xl">
                {profile.displayName}
              </h1>
              {profile.bio && (
                <p className="mt-1 max-w-lg text-sm text-[#949BA4]">
                  {profile.bio}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                {profile.country && (
                  <Badge variant="outline">{profile.country}</Badge>
                )}
                {isClaimed && (
                  <Badge className="bg-[#22c55e]/20 text-[#22c55e]">
                    Verified by TwitchMetrics
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleShare}>
                {copied ? "Copied!" : "Share"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled
                title="Coming soon"
                className="cursor-not-allowed"
              >
                Download PDF
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Total Stats Bar */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Total Followers
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatNumber(Number(profile.totalFollowers))}
          </p>
        </Card>
        <Card className="text-center">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Total Views
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {formatNumber(Number(profile.totalViews))}
          </p>
        </Card>
        <Card className="text-center sm:col-span-1 col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[#949BA4]">
            Platforms
          </p>
          <p className="mt-1 text-2xl font-bold text-[#F2F3F5]">
            {profile.platformAccounts.length}
          </p>
        </Card>
      </div>

      {/* Platform Breakdown */}
      {profile.platformAccounts.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-[#F2F3F5]">
            Platform Breakdown
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.platformAccounts.map((account) => {
              const config = PLATFORM_CONFIG[account.platform];
              const growth = growthByPlatform.get(account.platform);

              return (
                <Card
                  key={account.platform}
                  className="flex items-center gap-3 transition-colors hover:border-[#4E5058]"
                >
                  <PlatformIcon platform={account.platform} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[#DBDEE1]">
                        {config.name}
                      </span>
                      {account.platformUrl && (
                        <a
                          href={account.platformUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[#949BA4] hover:text-[#DBDEE1]"
                        >
                          @{account.platformUsername}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-bold text-[#F2F3F5]">
                        {formatNumber(Number(account.followerCount))}
                      </span>
                      {growth && (
                        <span className="flex items-center gap-0.5 text-xs">
                          <TrendArrow direction={growth.trendDirection} />
                          <span
                            className={cn(
                              "font-medium",
                              growth.trendDirection === "up" &&
                                "text-[#22c55e]",
                              growth.trendDirection === "down" &&
                                "text-[#ef4444]",
                              growth.trendDirection !== "up" &&
                                growth.trendDirection !== "down" &&
                                "text-[#949BA4]",
                            )}
                          >
                            {growth.pct30d !== null
                              ? formatPercent(growth.pct30d)
                              : "0.0%"}
                          </span>
                          <span className="text-[#949BA4]">30d</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Audience Demographics */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-[#F2F3F5]">
          Audience Demographics
        </h2>
        {isClaimed && analytics ? (
          <DemographicsDisplay analytics={analytics} />
        ) : (
          <Card className="relative overflow-hidden">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 rounded-lg bg-[#383A40] p-3">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#949BA4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#DBDEE1]">
                Audience insights locked
              </p>
              <p className="mt-1 max-w-xs text-xs text-[#949BA4]">
                {isClaimed
                  ? "Audience data is still being collected. Check back soon."
                  : "Claim this profile to unlock detailed audience demographics."}
              </p>
              {!isClaimed && (
                <Link href={`/creator/${profile.slug}`} className="mt-3">
                  <Button size="sm">View Profile</Button>
                </Link>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Brand Partnerships */}
      {profile.partnerships.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold text-[#F2F3F5]">
            Brand Partnerships
          </h2>
          <Card>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {profile.partnerships.map((partner, idx) => {
                const logoSrc = getSafeImageSrc(partner.brandLogoUrl);
                return (
                  <div
                    key={`${partner.brandName}-${idx}`}
                    className="flex flex-col items-center gap-2 rounded-lg bg-[#2B2D31] p-3 text-center"
                  >
                    {logoSrc ? (
                      <Image
                        src={logoSrc}
                        alt={partner.brandName}
                        width={48}
                        height={48}
                        className="rounded-md object-contain"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#383A40] text-sm font-bold text-[#949BA4]">
                        {partner.brandName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-[#DBDEE1]">
                        {partner.brandName}
                      </p>
                      {partner.campaignName && (
                        <p className="text-[10px] text-[#949BA4]">
                          {partner.campaignName}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 border-t border-[#3F4147] pt-6 text-center">
        <p className="text-xs text-[#949BA4]">
          Generated by{" "}
          <Link
            href="/"
            className="font-medium text-[#DBDEE1] hover:text-[#F2F3F5]"
          >
            TwitchMetrics
          </Link>
        </p>
        <div className="mt-1 flex items-center justify-center gap-3">
          <Link
            href={`/creator/${profile.slug}`}
            className="text-xs text-[#949BA4] hover:text-[#DBDEE1]"
          >
            View full profile
          </Link>
          <span className="text-[#3F4147]">|</span>
          <span className="text-xs text-[#949BA4]">
            {formatDate(new Date())}
          </span>
        </div>
      </div>
    </div>
  );
}

function DemographicsDisplay({
  analytics,
}: {
  analytics: NonNullable<AnalyticsData>;
}) {
  const countryData = analytics.countryData as Record<string, number> | null;
  const ageGenderData = analytics.ageGenderData as Record<
    string,
    number
  > | null;

  const hasCountryData = countryData && Object.keys(countryData).length > 0;
  const hasAgeGenderData =
    ageGenderData && Object.keys(ageGenderData).length > 0;

  if (!hasCountryData && !hasAgeGenderData) {
    return (
      <Card className="py-8 text-center">
        <p className="text-sm text-[#949BA4]">
          Audience data is still being collected. Check back soon.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {hasCountryData && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[#F2F3F5]">
            Top Countries
          </h3>
          <div className="space-y-2">
            {Object.entries(countryData)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([country, value]) => (
                <div
                  key={country}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-[#DBDEE1]">{country}</span>
                  <span className="text-sm font-medium text-[#F2F3F5]">
                    {typeof value === "number"
                      ? `${(value * 100).toFixed(1)}%`
                      : String(value)}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}
      {hasAgeGenderData && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-[#F2F3F5]">
            Age & Gender
          </h3>
          <div className="space-y-2">
            {Object.entries(ageGenderData)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 6)
              .map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#DBDEE1]">{label}</span>
                    <span className="font-medium text-[#F2F3F5]">
                      {typeof value === "number"
                        ? `${(value * 100).toFixed(1)}%`
                        : String(value)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-[#2B2D31]">
                    <div
                      className="h-1.5 rounded-full bg-[#E32C19]"
                      style={{
                        width: `${typeof value === "number" ? Math.min(value * 100, 100) : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
