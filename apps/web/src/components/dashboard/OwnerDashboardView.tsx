"use client";

import { useCallback, useState } from "react";
import type { Platform, ProfileState } from "@twitchmetrics/database";
import { CreatorHeader } from "@/components/creator";
import { computeProfileCompletion } from "@/lib/profile-completion";
import { DashboardGrid, type SerializedProfile } from "./DashboardGrid";

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

export type DashboardHeaderData = {
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

type OwnerDashboardViewProps = {
  headerData: DashboardHeaderData;
  profile: SerializedProfile;
  widgetConfig: unknown;
  isClaimed: boolean;
};

function ShareUrlButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}/creator/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [slug]);

  return (
    <button
      type="button"
      onClick={handleCopy}
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
  );
}

function CustomizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Customize
    </button>
  );
}

export function OwnerDashboardView({
  headerData,
  profile,
  widgetConfig,
  isClaimed,
}: OwnerDashboardViewProps) {
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const activeConnections = profile.platformAccounts.filter(
    (account) => account.isOAuthConnected,
  ).length;
  const completionPct = computeProfileCompletion({
    displayName: profile.displayName,
    email: profile.ownerEmail,
    avatarUrl: profile.avatarUrl,
    country: profile.country,
    language: profile.language,
    gender: profile.gender,
    age: profile.age,
    interests: profile.interests,
    bio: profile.bio,
    connectedAccountsCount: activeConnections,
    partnershipsCount: profile.brandPartnerships.length,
  }).percentage;

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6">
      <CreatorHeader
        creator={headerData}
        hideStatusBadge
        completionPct={completionPct}
        ownerActions={
          <>
            <CustomizeButton onClick={() => setCustomizeOpen(true)} />
            <ShareUrlButton slug={profile.slug} />
          </>
        }
      />
      <DashboardGrid
        profile={profile}
        widgetConfig={widgetConfig}
        isClaimed={isClaimed}
        isOwner
        customizeOpen={customizeOpen}
        onCustomizeClose={() => setCustomizeOpen(false)}
      />
    </div>
  );
}
