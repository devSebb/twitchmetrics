"use client";

import { useMemo, useState } from "react";
import type { Platform } from "@twitchmetrics/database";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";
import { DemographicsCharts } from "./DemographicsCharts";
import { StatCard } from "./StatCard";

type SerializedAnalytics = {
  platform: Platform;
  periodStart: string;
  periodEnd: string;
  estimatedMinutesWatched: string | null;
  averageViewDuration: number | null;
  subscribersGained: number | null;
  subscribersLost: number | null;
  estimatedRevenue: number | null;
  views: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: string | null;
  reach: string | null;
  profileViews: number | null;
  websiteClicks: number | null;
  subscriberCount: number | null;
  subscriberPoints: number | null;
  ageGenderData: Record<string, Record<string, number>> | null;
  countryData: Record<string, number> | null;
  deviceData: Record<string, number> | null;
  trafficSources: Record<string, number> | null;
  fetchedAt: string;
};

type AnalyticsDashboardProps = {
  analytics: SerializedAnalytics[];
  platforms: Platform[];
};

function formatInt(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString();
}

function formatBigIntString(value: string | null | undefined): string {
  if (!value) return "0";
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return Math.round(parsed).toLocaleString();
  }
  return value;
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatWatchTimeHours(minutes: string | null): string {
  if (!minutes) return "0h";
  const parsed = Number(minutes);
  if (!Number.isFinite(parsed)) return "0h";
  return `${(parsed / 60).toFixed(1)}h`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    return "0s";
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  return `${Math.round(seconds)}s`;
}

export function AnalyticsDashboard({
  analytics,
  platforms,
}: AnalyticsDashboardProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>(
    platforms[0]!,
  );

  const selectedAnalytics = useMemo(() => {
    return analytics.find((item) => item.platform === selectedPlatform) ?? null;
  }, [analytics, selectedPlatform]);

  if (!selectedAnalytics) {
    return (
      <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-6">
        <p className="text-sm text-[#949BA4]">
          No enrichment data is available yet for your connected platforms.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {platforms.map((platform) => {
          const isActive = platform === selectedPlatform;
          return (
            <button
              key={platform}
              type="button"
              onClick={() => setSelectedPlatform(platform)}
              className={
                isActive
                  ? "rounded-lg border border-[#E32C19] bg-[#E32C19]/20 px-3 py-2 text-sm font-semibold text-[#F2F3F5]"
                  : "rounded-lg border border-[#3F4147] bg-[#313338] px-3 py-2 text-sm font-medium text-[#949BA4]"
              }
            >
              {PLATFORM_CONFIG[platform].name}
            </button>
          );
        })}
      </div>

      {selectedPlatform === "youtube" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Watch time"
            value={formatWatchTimeHours(
              selectedAnalytics.estimatedMinutesWatched,
            )}
          />
          <StatCard
            label="Subscribers gained"
            value={formatInt(selectedAnalytics.subscribersGained)}
          />
          <StatCard
            label="Views"
            value={formatBigIntString(selectedAnalytics.views)}
          />
          <StatCard
            label="Estimated revenue"
            value={formatCurrency(selectedAnalytics.estimatedRevenue)}
          />
          <StatCard
            label="Avg view duration"
            value={formatDuration(selectedAnalytics.averageViewDuration)}
          />
          <StatCard label="Likes" value={formatInt(selectedAnalytics.likes)} />
          <StatCard
            label="Comments"
            value={formatInt(selectedAnalytics.comments)}
          />
          <StatCard
            label="Shares"
            value={formatInt(selectedAnalytics.shares)}
          />
        </div>
      ) : null}

      {selectedPlatform === "instagram" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Reach"
            value={formatBigIntString(selectedAnalytics.reach)}
          />
          <StatCard
            label="Impressions"
            value={formatBigIntString(selectedAnalytics.impressions)}
          />
          <StatCard
            label="Profile views"
            value={formatInt(selectedAnalytics.profileViews)}
          />
          <StatCard
            label="Website clicks"
            value={formatInt(selectedAnalytics.websiteClicks)}
          />
        </div>
      ) : null}

      {selectedPlatform === "twitch" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard
            label="Subscriber count"
            value={formatInt(selectedAnalytics.subscriberCount)}
          />
          <StatCard
            label="Subscriber points"
            value={formatInt(selectedAnalytics.subscriberPoints)}
          />
        </div>
      ) : null}

      <DemographicsCharts
        ageGenderData={selectedAnalytics.ageGenderData}
        countryData={selectedAnalytics.countryData}
        deviceData={selectedAnalytics.deviceData}
        trafficSources={selectedAnalytics.trafficSources}
      />

      <p className="text-xs text-[#949BA4]">
        Last updated: {new Date(selectedAnalytics.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
