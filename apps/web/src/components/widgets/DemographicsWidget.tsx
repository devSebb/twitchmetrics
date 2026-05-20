"use client";

import { useMemo } from "react";
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

const GENDER_KEYS = new Set(["male", "female", "other", "unknown"]);
const MAX_COUNTRIES = 5;

function isGenderFirst(data: GenderBreakdown): boolean {
  return Object.keys(data).some((key) => GENDER_KEYS.has(key.toLowerCase()));
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function normalizeLabel(value: string): string {
  if (value.toLowerCase() === "unknown") return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function countryCodeToFlag(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return null;

  return normalized
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

function countryDisplayName(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized === "OTHER") return "Other";

  try {
    if (
      typeof Intl !== "undefined" &&
      "DisplayNames" in Intl &&
      /^[A-Z]{2}$/.test(normalized)
    ) {
      return (
        new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ??
        normalized
      );
    }
  } catch {
    // Fall through to readable fallback.
  }

  return code
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(normalizeLabel)
    .join(" ");
}

// ----------------------------------------------------------------
// Parsers — degrade gracefully
// ----------------------------------------------------------------

function parseGenderData(raw: unknown): {
  genderSplit: { key: string; name: string; value: number }[];
  ageRanges: { range: string; percentage: number }[];
} | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as GenderBreakdown;
  const normalized: GenderBreakdown = {};

  if (isGenderFirst(data)) {
    for (const [gender, ageMap] of Object.entries(data)) {
      normalized[gender] = ageMap;
    }
  } else {
    // Enrichment stores age-first: { "18-24": { male: 0.3 } }. Normalize
    // it for this compact widget, which renders gender split + age bars.
    for (const [ageRange, genderMap] of Object.entries(data)) {
      for (const [gender, pct] of Object.entries(genderMap)) {
        normalized[gender] = normalized[gender] ?? {};
        normalized[gender]![ageRange] = pct;
      }
    }
  }

  const genders = Object.keys(normalized);
  if (genders.length === 0) return null;

  // Gender split totals
  const rawGenderSplit = genders
    .map((gender) => {
      const ageMap = normalized[gender]!;
      const total = Object.values(ageMap).reduce((s, v) => s + v, 0);
      return {
        key: gender.toLowerCase(),
        name: normalizeLabel(gender),
        value: total,
      };
    })
    .filter((gender) => gender.value > 0);
  const genderTotal = rawGenderSplit.reduce(
    (sum, gender) => sum + gender.value,
    0,
  );
  const genderSplit =
    genderTotal > 0
      ? rawGenderSplit.map((gender) => ({
          ...gender,
          value: gender.value / genderTotal,
        }))
      : rawGenderSplit;

  // Aggregate age ranges across genders
  const ageMap = new Map<string, number>();
  for (const gender of genders) {
    const ages = normalized[gender]!;
    for (const [range, pct] of Object.entries(ages)) {
      ageMap.set(range, (ageMap.get(range) ?? 0) + pct);
    }
  }

  const rawAgeRanges = [...ageMap.entries()]
    .map(([range, percentage]) => ({ range, percentage }))
    .sort((a, b) => {
      const numA = parseInt(a.range, 10) || 0;
      const numB = parseInt(b.range, 10) || 0;
      return numA - numB;
    });
  const ageTotal = rawAgeRanges.reduce((sum, age) => sum + age.percentage, 0);
  const ageRanges =
    ageTotal > 0
      ? rawAgeRanges.map((age) => ({
          ...age,
          percentage: age.percentage / ageTotal,
        }))
      : rawAgeRanges;

  return { genderSplit, ageRanges };
}

function parseCountryData(
  raw: unknown,
): { country: string; percentage: number }[] | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as CountryBreakdown;
  const rawEntries = Object.entries(data)
    .map(([country, percentage]) => ({ country, percentage }))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, MAX_COUNTRIES);
  const total = rawEntries.reduce((sum, entry) => sum + entry.percentage, 0);
  const entries =
    total > 1.01
      ? rawEntries.map((entry) => ({
          ...entry,
          percentage: entry.percentage / 100,
        }))
      : rawEntries;

  return entries.length > 0 ? entries : null;
}

// ----------------------------------------------------------------
// Presentation pieces
// ----------------------------------------------------------------

function AudienceSummary({
  genderSplit,
}: {
  genderSplit: { key: string; name: string; value: number }[];
}) {
  const visible = genderSplit
    .filter((gender) => gender.value >= 0.01)
    .sort((left, right) => {
      const order = ["male", "female", "other", "unknown"];
      return order.indexOf(left.key) - order.indexOf(right.key);
    });

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
      {visible.map((gender) => (
        <div key={gender.key} className="flex items-baseline gap-2">
          <span className="text-2xl font-bold leading-none text-[#F2F3F5]">
            {formatPercent(gender.value)}
          </span>
          <span className="text-xs font-semibold text-[#949BA4]">
            {gender.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function AgeBars({
  ageRanges,
}: {
  ageRanges: { range: string; percentage: number }[];
}) {
  return (
    <div className="mt-4 space-y-2">
      {ageRanges.map((age) => (
        <div key={age.range}>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold">
            <span className="text-[#F2F3F5]">{age.range}</span>
            <span className="text-[#F2F3F5]">
              {formatPercent(age.percentage)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#3F4147]">
            <div
              className="h-full rounded-full bg-[#E32C19]"
              style={{ width: `${Math.min(age.percentage * 100, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function CountryRows({
  countries,
}: {
  countries: { country: string; percentage: number }[];
}) {
  return (
    <div className="space-y-5">
      {countries.map((country) => {
        const flag = countryCodeToFlag(country.country);
        const label = countryDisplayName(country.country);
        return (
          <div
            key={country.country}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-lg leading-none">{flag ?? "🌐"}</span>
              <span className="truncate text-lg font-semibold text-[#F2F3F5]">
                {label}
              </span>
            </div>
            <span className="shrink-0 text-lg font-bold text-[#F2F3F5]">
              {formatPercent(country.percentage)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------
// Main widget
// ----------------------------------------------------------------

type DemographicsWidgetProps = {
  profile: SerializedProfile;
  isClaimed: boolean;
  isOwner?: boolean;
};

export function DemographicsWidget({
  profile,
  isClaimed,
  isOwner = true,
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

  // Non-owners can't access the demographics tRPC call (it's auth-gated)
  if (!isOwner) {
    return (
      <EmptyState
        variant="no_data"
        title="Audience Demographics"
        message="Audience demographics are managed by the creator."
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
      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(220px,0.9fr)]">
        {(genderData || ageData) && (
          <div>
            {genderData && <AudienceSummary genderSplit={genderData} />}
            {ageData && <AgeBars ageRanges={ageData} />}
          </div>
        )}

        {countryData && <CountryRows countries={countryData} />}
      </div>

      {sourcePlatform && (
        <p className="text-right text-[10px] text-[#949BA4]">
          via {sourcePlatform.charAt(0).toUpperCase() + sourcePlatform.slice(1)}{" "}
          Analytics
        </p>
      )}
    </div>
  );
}
