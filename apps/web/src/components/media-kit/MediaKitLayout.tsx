"use client";

import { useState } from "react";
import Link from "next/link";
import { AppearanceProvider } from "@/components/ui/Appearance";
import { Container, ActionLink } from "@/components/ui/Editorial";
import { EditorialCreatorHeader } from "@/components/creator/EditorialCreatorHeader";
import {
  EditorialSections,
  type EditorialSection,
} from "@/components/creator/EditorialSections";
import type { PublicCreatorView } from "@/components/creator/CreatorProfileLayout";
import { WidgetCard } from "@/components/dashboard/WidgetCard";
import {
  StatsRow,
  FeaturedClipsWidget,
  DemographicsWidget,
  PopularGamesWidget,
  BrandPartnersWidget,
  PlatformBreakdownWidget,
  hasPublicDemographics,
} from "@/components/widgets";
import {
  PLATFORM_CONFIG,
  sortByPlatformOrder,
} from "@/lib/constants/platforms";
import { getEnabledWidgets } from "@/lib/constants/widgets";
import { formatNumber, formatPercent } from "@/lib/utils/format";
import { getPlatformProfileUrl } from "@/lib/platform-profile-url";
import { publicMediaKitUrl } from "@/lib/profile-sections";
import { SITE_URL } from "@/lib/constants/seo";
import { Wordmark } from "@/components/brand/Wordmark";

export function MediaKitLayout(view: PublicCreatorView) {
  const { profile, headerData, isClaimed, dataAvailability, statsContext } =
    view;
  const [shareState, setShareState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const publicUrl = publicMediaKitUrl(SITE_URL, profile.slug);
  const enabled = new Set(getEnabledWidgets(profile.widgetConfig));
  const growth = new Map(
    profile.growthRollups.map((item) => [item.platform, item]),
  );
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setShareState("copied");
    } catch {
      setShareState("manual");
    }
  }
  const sections: EditorialSection[] = [
    {
      id: "overview",
      title: "At a glance.",
      keepVisible: true,
      content: (
        <>
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
            <p className="max-w-xl text-xl leading-relaxed tracking-tight sm:text-2xl">
              <strong>{profile.displayName}</strong> has{" "}
              {formatNumber(Number(profile.totalFollowers))} followers across{" "}
              {profile.platformAccounts.length} tracked{" "}
              {profile.platformAccounts.length === 1 ? "platform" : "platforms"}
              . Explore the audience, recent content and platform performance
              below.
            </p>
            <dl className="grid grid-cols-2 gap-6 border-t border-n-line pt-5">
              <div>
                <dt className="n-eyebrow text-n-slate">Tracked total views</dt>
                <dd className="mt-3 text-4xl font-extrabold tracking-tight">
                  {formatNumber(Number(profile.totalViews))}
                </dd>
              </div>
              <div>
                <dt className="n-eyebrow text-n-slate">Platforms</dt>
                <dd className="mt-3 text-4xl font-extrabold tracking-tight">
                  {profile.platformAccounts.length}
                </dd>
              </div>
              <p className="col-span-2 text-xs leading-relaxed text-n-slate">
                Figures reflect available tracked accounts and their latest
                snapshots. Platform definitions and coverage vary; totals do not
                represent unique people.
              </p>
            </dl>
          </div>
          <div
            className="mt-10 overflow-x-auto"
            role="region"
            aria-label="Platform audience and 30-day growth"
            tabIndex={0}
          >
            <table className="n-table min-w-[640px]">
              <caption className="mb-4 text-left text-sm text-n-slate">
                Platform audience and follower change · last 30 days
              </caption>
              <thead>
                <tr>
                  <th scope="col">Platform / account</th>
                  <th scope="col">Followers / subscribers</th>
                  <th scope="col">Change</th>
                  <th scope="col">Change %</th>
                </tr>
              </thead>
              <tbody>
                {sortByPlatformOrder(headerData.platformAccounts).map(
                  (account) => {
                    const rollup = growth.get(account.platform);
                    const delta = rollup?.delta30d;
                    const url = getPlatformProfileUrl(
                      account.platform,
                      account.platformUrl,
                      account.platformUsername,
                    );
                    return (
                      <tr key={account.platform}>
                        <th scope="row">
                          <span className="block font-semibold text-n-ink">
                            {PLATFORM_CONFIG[account.platform].name}
                          </span>
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block text-xs underline"
                            >
                              @{account.platformUsername}
                            </a>
                          ) : (
                            <span className="text-xs">
                              @{account.platformUsername}
                            </span>
                          )}
                        </th>
                        <td className="font-semibold">
                          {account.followerCount === null
                            ? "—"
                            : formatNumber(Number(account.followerCount))}
                        </td>
                        <td>
                          {delta == null ? (
                            <span className="text-n-slate">
                              Not enough history
                            </span>
                          ) : (
                            `${Number(delta) > 0 ? "+" : ""}${formatNumber(Number(delta))}`
                          )}
                        </td>
                        <td>
                          {rollup?.pct30d == null
                            ? "—"
                            : formatPercent(rollup.pct30d)}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
          {enabled.has("stats_row") && (
            <div className="mt-10">
              <WidgetCard widgetId="stats_row">
                <StatsRow profile={profile} statsContext={statsContext} />
              </WidgetCard>
            </div>
          )}
        </>
      ),
    },
  ];
  if (enabled.has("featured_clips") && dataAvailability.featured_clips)
    sections.push({
      id: "clips",
      title: "Featured clips.",
      content: (
        <WidgetCard widgetId="featured_clips">
          <FeaturedClipsWidget profile={profile} />
        </WidgetCard>
      ),
    });
  const demographics = hasPublicDemographics(profile, isClaimed);
  const breakdown =
    enabled.has("platform_breakdown") &&
    headerData.platformAccounts.some(
      (account) => Number(account.followerCount ?? 0) > 0,
    );
  if (breakdown || (enabled.has("demographics") && demographics))
    sections.push({
      id: "audience",
      title: "Meet the audience.",
      content: (
        <div className="space-y-10">
          {breakdown && (
            <WidgetCard widgetId="platform_breakdown">
              <PlatformBreakdownWidget profile={profile} />
            </WidgetCard>
          )}
          {enabled.has("demographics") && demographics && (
            <WidgetCard widgetId="demographics">
              <DemographicsWidget
                profile={profile}
                isClaimed={isClaimed}
                isOwner={false}
              />
            </WidgetCard>
          )}
        </div>
      ),
    });
  if (enabled.has("popular_games") && dataAvailability.popular_games)
    sections.push({
      id: "content",
      title: "Content, in focus.",
      content: (
        <WidgetCard widgetId="popular_games">
          <PopularGamesWidget profile={profile} />
        </WidgetCard>
      ),
    });
  if (isClaimed && profile.brandPartnerships.length > 0)
    sections.push({
      id: "partners",
      title: "Brand partners.",
      content: (
        <>
          <p className="mb-6 text-sm text-n-slate">
            Partnerships added by the creator.
          </p>
          <WidgetCard widgetId="brand_partners">
            <BrandPartnersWidget profile={profile} isOwner={false} />
          </WidgetCard>
        </>
      ),
    });

  return (
    <AppearanceProvider>
      <div className="noticed noticed-analytics">
        <EditorialCreatorHeader
          creator={headerData}
          kit
          actions={
            <button
              type="button"
              className="n-button n-button-light"
              onClick={copyLink}
            >
              {shareState === "copied" ? "Link copied" : "Copy media-kit link"}
            </button>
          }
        />
        {shareState !== "idle" && (
          <Container className="py-4">
            <p role="status" className="text-sm">
              {shareState === "copied"
                ? "Public media-kit link copied. Anyone with this link can open the public view."
                : "Copy this public link manually:"}
            </p>
            {shareState === "manual" && (
              <input
                aria-label="Public media-kit link"
                className="n-input mt-2"
                readOnly
                value={publicUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </Container>
        )}
        <EditorialSections sections={sections} />
        <div className="border-t border-n-line bg-n-surface">
          <Container className="flex flex-wrap items-center justify-between gap-6 py-12">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                There’s more behind the numbers.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-n-slate">
                Find the full follower and viewer histories, recent-stream table
                and enabled profile sections in the analytical profile.
              </p>
            </div>
            <ActionLink href={`/creator/${profile.slug}`}>
              Explore full analytics
            </ActionLink>
          </Container>
        </div>
        <Container className="flex flex-wrap items-center justify-between gap-5 py-8">
          <Link href="/" aria-label="Noticed home">
            <Wordmark />
          </Link>
          <div className="text-right">
            <button
              type="button"
              disabled
              className="n-button n-button-secondary"
              title="Creator media-kit PDF download is not available yet"
            >
              Download PDF · coming soon
            </button>
            <p className="mt-2 text-xs text-n-slate">
              Share the public link for the latest available figures.
            </p>
          </div>
        </Container>
      </div>
    </AppearanceProvider>
  );
}
