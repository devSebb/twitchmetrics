"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { getSafeImageSrc } from "@/lib/safeImage";
import type { SerializedProfile } from "./DashboardGrid";

type Props = {
  profile: SerializedProfile;
  isOwner: boolean;
};

function formatFollowers(count: string | null): string {
  if (!count) return "0";
  const n = Number(count);
  if (Number.isNaN(n)) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function computeCompletion(profile: SerializedProfile): number {
  let score = 0;
  if (profile.bio) score += 25;
  if (profile.avatarUrl) score += 25;
  if (profile.bannerUrl) score += 25;
  if (profile.platformAccounts.length > 0) score += 25;
  return score;
}

export function DashboardProfileHeader({ profile, isOwner }: Props) {
  const [copied, setCopied] = useState(false);
  const completion = computeCompletion(profile);

  const handleCopyUrl = useCallback(() => {
    const url = `${window.location.origin}/creator/${profile.slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [profile.slug]);

  const totalConnections = Number(profile.totalFollowers) || 0;

  return (
    <div>
      {/* Banner */}
      <div className="relative h-40 w-full overflow-hidden sm:h-56">
        {profile.bannerUrl && getSafeImageSrc(profile.bannerUrl) ? (
          <Image
            src={getSafeImageSrc(profile.bannerUrl)!}
            alt="Banner"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-r from-[#E32C19]/30 via-[#313338] to-[#9146ff]/30" />
        )}
      </div>

      {/* Content below banner */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          {/* Avatar */}
          <div className="-mt-12 sm:-mt-16">
            {profile.avatarUrl && getSafeImageSrc(profile.avatarUrl) ? (
              <Image
                src={getSafeImageSrc(profile.avatarUrl)!}
                alt={profile.displayName}
                width={128}
                height={128}
                className="h-24 w-24 rounded-full border-4 border-[#2B2D31] object-cover sm:h-32 sm:w-32"
                priority
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[#2B2D31] bg-[#383A40] text-3xl font-bold text-[#F2F3F5] sm:h-32 sm:w-32">
                {profile.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Name + completion */}
          <div className="flex-1 pb-4">
            <h1 className="text-2xl font-bold text-[#F2F3F5]">
              {profile.displayName}
            </h1>

            {/* Completion bar */}
            {isOwner && completion < 100 && (
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#383A40]">
                  <div
                    className="h-full rounded-full bg-[#E32C19] transition-all"
                    style={{ width: `${completion}%` }}
                  />
                </div>
                <span className="text-xs text-[#949BA4]">
                  {completion}% complete
                </span>
              </div>
            )}
          </div>

          {/* Share URL button */}
          <div className="pb-4">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-xs font-medium text-[#DBDEE1] transition-colors hover:bg-[#4E5058]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              {copied ? "Copied!" : "Share URL"}
            </button>
          </div>
        </div>

        {/* Bio */}
        {profile.bio && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#DBDEE1]">
            {profile.bio}
          </p>
        )}

        {/* Stats row: Total Connections + per-platform badges */}
        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-[#3F4147] pt-5">
          {/* Total Connections */}
          <div>
            <p className="text-2xl font-bold text-[#F2F3F5]">
              {formatFollowers(String(totalConnections))}
            </p>
            <p className="text-xs text-[#949BA4]">Total Connections</p>
          </div>

          {/* Per-platform badges */}
          {profile.platformAccounts.map((acct) => {
            const config = PLATFORM_CONFIG[acct.platform];
            return (
              <div key={acct.platform} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: config.color }}
                />
                <div>
                  <p className="text-sm font-semibold text-[#F2F3F5]">
                    {formatFollowers(acct.followerCount)}
                  </p>
                  <p className="text-xs text-[#949BA4]">{config.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
