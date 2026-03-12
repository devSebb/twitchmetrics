"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { ProfileState } from "@twitchmetrics/database";
import { BaseChart } from "@/components/charts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type DemographicsSectionProps = {
  state: ProfileState;
  demographics?: {
    genderSplit?: { male: number; female: number; other: number };
    ageRanges?: { label: string; percent: number }[];
    topCountries?: { code: string; name: string; percent: number }[];
  } | null;
};

function BlurredOverlay() {
  return (
    <div className="relative overflow-hidden rounded-lg border border-[#3F4147] bg-[#313338] p-6">
      {/* Blurred fake content */}
      <div className="pointer-events-none select-none blur-sm">
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-[#383A40]" />
            <div className="h-32 w-32 rounded-full bg-[#383A40]" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-[#383A40]" />
            {[70, 55, 40, 25, 15].map((w) => (
              <div key={w} className="flex items-center gap-2">
                <div className="h-3 w-12 rounded bg-[#383A40]" />
                <div
                  className="h-4 rounded bg-[#383A40]"
                  style={{ width: `${w}%` }}
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-[#383A40]" />
            {[52, 25, 11, 8, 4].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#383A40]" />
                <div className="h-3 w-20 rounded bg-[#383A40]" />
                <div className="ml-auto h-3 w-8 rounded bg-[#383A40]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#313338]/60 backdrop-blur-[2px]">
        <p className="mb-3 text-center text-sm font-medium text-[#DBDEE1]">
          Claim this profile to unlock audience insights
        </p>
        <Button variant="primary" size="md">
          Claim This Profile
        </Button>
      </div>
    </div>
  );
}

function GenderDonut({
  genderSplit,
}: {
  genderSplit: { male: number; female: number; other: number };
}) {
  const option = useMemo(
    (): EChartsOption => ({
      tooltip: {
        trigger: "item",
        formatter: "{b}: {d}%",
      },
      series: [
        {
          type: "pie" as const,
          radius: ["55%", "75%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          label: { show: false },
          data: [
            {
              value: genderSplit.male,
              name: "Male",
              itemStyle: { color: "#5B8DEF" },
            },
            {
              value: genderSplit.female,
              name: "Female",
              itemStyle: { color: "#E4405F" },
            },
            {
              value: genderSplit.other,
              name: "Other",
              itemStyle: { color: "#949BA4" },
            },
          ],
        },
      ],
    }),
    [genderSplit],
  );

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-[#F2F3F5]">
        Channel Audience
      </h3>
      <div className="flex items-center gap-3">
        <div className="h-32 w-32">
          <BaseChart option={option} height={128} />
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#5B8DEF]" />
            <span className="text-[#DBDEE1]">{genderSplit.male}% Male</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#E4405F]" />
            <span className="text-[#DBDEE1]">{genderSplit.female}% Female</span>
          </div>
          {genderSplit.other > 0 && (
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#949BA4]" />
              <span className="text-[#DBDEE1]">{genderSplit.other}% Other</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgeRanges({
  ageRanges,
}: {
  ageRanges: { label: string; percent: number }[];
}) {
  const maxPercent = Math.max(...ageRanges.map((r) => r.percent));

  return (
    <div>
      <div className="space-y-2">
        {ageRanges.map((range) => (
          <div key={range.label} className="flex items-center gap-3 text-xs">
            <span className="w-10 text-right text-[#949BA4]">
              {range.label}
            </span>
            <div className="flex-1">
              <div className="h-4 overflow-hidden rounded-sm bg-[#383A40]">
                <div
                  className="h-full rounded-sm bg-[#E32C19]"
                  style={{
                    width: `${(range.percent / maxPercent) * 100}%`,
                  }}
                />
              </div>
            </div>
            <span className="w-10 text-right text-[#DBDEE1]">
              {range.percent}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCountries({
  countries,
}: {
  countries: { code: string; name: string; percent: number }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-[#F2F3F5]">Top Countries</h3>
      <div className="space-y-2">
        {countries.map((c) => (
          <div
            key={c.code}
            className="flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#E32C19]" />
              <span className="text-[#DBDEE1]">{c.name}</span>
            </div>
            <span className="font-medium text-[#F2F3F5]">{c.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemographicsSection({
  state,
  demographics,
}: DemographicsSectionProps) {
  if (state === "unclaimed" || state === "pending_claim") {
    return (
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">
          Channel Audience
        </h2>
        <BlurredOverlay />
      </div>
    );
  }

  if (!demographics) {
    return (
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">
          Channel Audience
        </h2>
        <Card className="flex items-center justify-center py-10">
          <p className="text-sm text-[#949BA4]">
            Connect YouTube or Instagram to unlock demographics
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h2 className="mb-3 text-lg font-bold text-[#F2F3F5]">
        Channel Audience
      </h2>
      <Card>
        <div className="grid gap-6 sm:grid-cols-3">
          {demographics.genderSplit && (
            <GenderDonut genderSplit={demographics.genderSplit} />
          )}
          {demographics.ageRanges && demographics.ageRanges.length > 0 && (
            <AgeRanges ageRanges={demographics.ageRanges} />
          )}
          {demographics.topCountries &&
            demographics.topCountries.length > 0 && (
              <TopCountries countries={demographics.topCountries} />
            )}
        </div>
      </Card>
    </div>
  );
}
