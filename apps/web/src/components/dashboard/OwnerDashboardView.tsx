"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { EditorialCreatorHeader } from "@/components/creator/EditorialCreatorHeader";
import { Container } from "@/components/ui/Editorial";
import { Button } from "@/components/ui";
import { computeProfileCompletion } from "@/lib/profile-completion";
import type { ProfileDataAvailability } from "@/lib/profile-layout";
import type { CreatorHeroData } from "@/lib/creator-hero";
import type { StatsContext } from "@/lib/stats-period";
import { DashboardGrid, type SerializedProfile } from "./DashboardGrid";

export type DashboardHeaderData = CreatorHeroData;

type OwnerDashboardViewProps = {
  headerData: DashboardHeaderData;
  profile: SerializedProfile;
  widgetConfig: unknown;
  isClaimed: boolean;
  dataAvailability: ProfileDataAvailability;
  statsContext?: StatsContext | undefined;
};

function ShareUrlButton({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const [url, setUrl] = useState("");
  const handleCopy = useCallback(async () => {
    const link = `${window.location.origin}/creator/${encodeURIComponent(slug)}`;
    setUrl(link);
    try {
      await navigator.clipboard.writeText(link);
      setStatus("copied");
    } catch {
      setStatus("manual");
    }
  }, [slug]);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button appearance="noticed" variant="secondary" onClick={handleCopy}>
        {status === "copied" ? "Link copied" : "Copy profile link"}
      </Button>
      {status === "manual" && (
        <label className="text-sm">
          Copy your profile link
          <input
            className="n-input mt-1"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
          />
        </label>
      )}
      <span className="sr-only" role="status">
        {status === "copied" ? "Profile link copied to clipboard." : ""}
      </span>
    </div>
  );
}

export function OwnerDashboardView({
  headerData,
  profile,
  widgetConfig,
  isClaimed,
  dataAvailability,
  statsContext,
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
    <div className="noticed-analytics">
      <Container className="flex flex-wrap items-center justify-between gap-5 py-6">
        <div>
          <p className="n-eyebrow text-n-slate">Your public profile</p>
          <p className="mt-2 text-sm text-n-slate">
            {completionPct}% complete ·{" "}
            <Link
              href="/dashboard/settings"
              className="font-semibold text-n-ink underline underline-offset-4"
            >
              Edit profile details
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            className="n-button n-button-secondary"
            href={`/creator/${profile.slug}`}
          >
            Preview profile ↗
          </Link>
          <ShareUrlButton slug={profile.slug} />
          <Button appearance="noticed" onClick={() => setCustomizeOpen(true)}>
            Customise profile
          </Button>
        </div>
      </Container>
      <EditorialCreatorHeader creator={headerData} owner />
      <DashboardGrid
        profile={profile}
        widgetConfig={widgetConfig}
        isClaimed={isClaimed}
        isOwner
        dataAvailability={dataAvailability}
        statsContext={statsContext}
        customizeOpen={customizeOpen}
        onCustomizeClose={() => setCustomizeOpen(false)}
      />
    </div>
  );
}
