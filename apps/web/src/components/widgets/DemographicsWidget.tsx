"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "@/components/charts";
import { EmptyState } from "@/components/widgets/EmptyState";
import { trpc } from "@/lib/trpc";
import type { SerializedProfile } from "@/components/dashboard/DashboardGrid";

// ----------------------------------------------------------------
// Demographics data types (from CreatorAnalytics JSON)
// ----------------------------------------------------------------

type GenderBreakdown = Record<string, Record<string, number>>;
// e.g. { male: { "18-24": 0.3 }, female: { "18-24": 0.25 } }

type CountryBreakdown = Record<string, number>;
// e.g. { "US": 0.45, "DE": 0.12 }

// ----------------------------------------------------------------
// Parsers — degrade gracefully
// ----------------------------------------------------------------

function parseGenderData(raw: unknown): {
  genderSplit: { name: string; value: number }[];
  ageRanges: { range: string; percentage: number }[];
} | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as GenderBreakdown;
  const genders = Object.keys(data);
  if (genders.length === 0) return null;

  // Gender split totals
  const genderSplit = genders.map((gender) => {
    const ageMap = data[gender]!;
    const total = Object.values(ageMap).reduce((s, v) => s + v, 0);
    return {
      name: gender.charAt(0).toUpperCase() + gender.slice(1),
      value: total,
    };
  });

  // Aggregate age ranges across genders
  const ageMap = new Map<string, number>();
  for (const gender of genders) {
    const ages = data[gender]!;
    for (const [range, pct] of Object.entries(ages)) {
      ageMap.set(range, (ageMap.get(range) ?? 0) + pct);
    }
  }

  const ageRanges = [...ageMap.entries()]
    .map(([range, percentage]) => ({ range, percentage }))
    .sort((a, b) => {
      const numA = parseInt(a.range, 10) || 0;
      const numB = parseInt(b.range, 10) || 0;
      return numA - numB;
    });

  return { genderSplit, ageRanges };
}

function parseCountryData(
  raw: unknown,
): { country: string; percentage: number }[] | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as CountryBreakdown;
  const entries = Object.entries(data)
    .map(([country, percentage]) => ({ country, percentage }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 5);

  return entries.length > 0 ? entries : null;
}

// ----------------------------------------------------------------
// Chart builders
// ----------------------------------------------------------------

function buildGenderChart(
  genderSplit: { name: string; value: number }[],
): EChartsOption {
  const GENDER_COLORS: Record<string, string> = {
    Male: "#5B8DEF",
    Female: "#E4405F",
    Other: "#949BA4",
  };

  return {
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name: string; percent: number };
        return `${p.name}: ${p.percent}%`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["50%", "70%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: "{b}\n{d}%",
          color: "#DBDEE1",
          fontSize: 11,
        },
        itemStyle: { borderRadius: 4, borderColor: "#313338", borderWidth: 2 },
        data: genderSplit.map((g) => ({
          value: Math.round(g.value * 100),
          name: g.name,
          itemStyle: { color: GENDER_COLORS[g.name] ?? "#949BA4" },
        })),
      },
    ],
  };
}

function buildAgeChart(
  ageRanges: { range: string; percentage: number }[],
): EChartsOption {
  return {
    grid: { left: 60, right: 20, top: 5, bottom: 5 },
    xAxis: {
      type: "value",
      show: false,
      max: Math.max(...ageRanges.map((a) => a.percentage)) * 1.2,
    },
    yAxis: {
      type: "category",
      data: ageRanges.map((a) => a.range),
      inverse: true,
      axisLabel: { color: "#949BA4", fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: { show: false },
    series: [
      {
        type: "bar",
        data: ageRanges.map((a) => ({
          value: Math.round(a.percentage * 100),
          itemStyle: { color: "#5B8DEF", borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 16,
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#DBDEE1",
          fontSize: 11,
        },
      },
    ],
  };
}

function buildCountryChart(
  countries: { country: string; percentage: number }[],
): EChartsOption {
  return {
    grid: { left: 50, right: 20, top: 5, bottom: 5 },
    xAxis: {
      type: "value",
      show: false,
      max: Math.max(...countries.map((c) => c.percentage)) * 1.2,
    },
    yAxis: {
      type: "category",
      data: countries.map((c) => c.country),
      inverse: true,
      axisLabel: { color: "#949BA4", fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    tooltip: { show: false },
    series: [
      {
        type: "bar",
        data: countries.map((c) => ({
          value: Math.round(c.percentage * 100),
          itemStyle: { color: "#E32C19", borderRadius: [0, 4, 4, 0] },
        })),
        barWidth: 16,
        label: {
          show: true,
          position: "right",
          formatter: "{c}%",
          color: "#DBDEE1",
          fontSize: 11,
        },
      },
    ],
  };
}

// ----------------------------------------------------------------
// Main widget
// ----------------------------------------------------------------

type DemographicsWidgetProps = {
  profile: SerializedProfile;
  isClaimed: boolean;
};

export function DemographicsWidget({
  profile,
  isClaimed,
}: DemographicsWidgetProps) {
  // Check if any connected account has OAuth
  const hasOAuth = profile.platformAccounts.some((a) => a.isOAuthConnected);

  if (!isClaimed) {
    return (
      <EmptyState
        variant="locked"
        title="Claim Required"
        message="Claim your profile to unlock audience insights."
        actionLabel="Claim Profile"
        actionHref="/dashboard/claim"
        compact
      />
    );
  }

  if (!hasOAuth) {
    return (
      <EmptyState
        variant="no_data"
        title="Connect a platform"
        message="Connect YouTube or Instagram to see demographics."
        actionLabel="Connect"
        actionHref="/dashboard/connections"
        compact
      />
    );
  }

  return <DemographicsDataView profile={profile} />;
}

function DemographicsDataView({ profile }: { profile: SerializedProfile }) {
  const { data: analytics, isLoading } = trpc.creator.getAnalytics.useQuery({
    periodDays: 30,
  });

  const { genderData, ageData, countryData, sourcePlatform } = useMemo(() => {
    if (!analytics || analytics.length === 0)
      return {
        genderData: null,
        ageData: null,
        countryData: null,
        sourcePlatform: null,
      };

    // Find first analytics entry with demographics data
    for (const entry of analytics) {
      const gender = parseGenderData(entry.ageGenderData);
      const country = parseCountryData(entry.countryData);

      if (gender || country) {
        return {
          genderData: gender?.genderSplit ?? null,
          ageData: gender?.ageRanges ?? null,
          countryData: country,
          sourcePlatform: entry.platform,
        };
      }
    }

    return {
      genderData: null,
      ageData: null,
      countryData: null,
      sourcePlatform: null,
    };
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#949BA4] border-t-transparent" />
      </div>
    );
  }

  if (!genderData && !ageData && !countryData) {
    return (
      <EmptyState
        variant="no_data"
        title="No demographics data"
        message="Demographics will appear once your connected platform syncs audience data."
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Gender donut */}
      {genderData && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-medium text-[#949BA4]">Gender</h4>
          </div>
          <BaseChart option={buildGenderChart(genderData)} height={140} />
        </div>
      )}

      {/* Age bars */}
      {ageData && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-[#949BA4]">Age Range</h4>
          <BaseChart
            option={buildAgeChart(ageData)}
            height={ageData.length * 28 + 10}
          />
        </div>
      )}

      {/* Top countries */}
      {countryData && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-[#949BA4]">
            Top Countries
          </h4>
          <BaseChart
            option={buildCountryChart(countryData)}
            height={countryData.length * 28 + 10}
          />
        </div>
      )}

      {/* Source attribution */}
      {sourcePlatform && (
        <p className="text-center text-[10px] text-[#949BA4]">
          via {sourcePlatform.charAt(0).toUpperCase() + sourcePlatform.slice(1)}{" "}
          Analytics
        </p>
      )}
    </div>
  );
}
