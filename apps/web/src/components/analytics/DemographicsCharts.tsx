"use client";

import { BaseChart } from "@/components/charts";
import type { EChartsOption } from "echarts";

type DemographicsChartsProps = {
  ageGenderData?: Record<string, Record<string, number>> | null;
  countryData?: Record<string, number> | null;
  deviceData?: Record<string, number> | null;
  trafficSources?: Record<string, number> | null;
};

function toPercent(value: number): number {
  return Number((value * 100).toFixed(2));
}

function ageGenderOption(
  ageGenderData: Record<string, Record<string, number>>,
): EChartsOption {
  const ages = Object.keys(ageGenderData).sort();
  const genderSet = new Set<string>();
  for (const age of ages) {
    for (const gender of Object.keys(ageGenderData[age] ?? {})) {
      genderSet.add(gender);
    }
  }
  const genders = Array.from(genderSet);
  return {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, textStyle: { color: "#DBDEE1" } },
    grid: { left: 40, right: 24, top: 40, bottom: 30 },
    xAxis: {
      type: "category",
      data: ages,
      axisLabel: { color: "#949BA4" },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "#949BA4",
        formatter: "{value}%",
      },
    },
    series: genders.map((gender) => ({
      name: gender[0]?.toUpperCase() + gender.slice(1),
      type: "bar",
      stack: "audience",
      data: ages.map((age) => toPercent(ageGenderData[age]?.[gender] ?? 0)),
    })),
  };
}

function distributionBarOption(
  title: string,
  data: Record<string, number>,
): EChartsOption {
  const entries = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  return {
    title: {
      text: title,
      left: 0,
      textStyle: { color: "#F2F3F5", fontSize: 14 },
    },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 80, right: 20, top: 36, bottom: 24 },
    xAxis: {
      type: "value",
      axisLabel: {
        color: "#949BA4",
        formatter: "{value}%",
      },
    },
    yAxis: {
      type: "category",
      data: entries.map(([label]) => label),
      axisLabel: { color: "#949BA4" },
    },
    series: [
      {
        type: "bar",
        data: entries.map(([, value]) => toPercent(value)),
      },
    ],
  };
}

function pieOption(title: string, data: Record<string, number>): EChartsOption {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return {
    title: {
      text: title,
      left: 0,
      textStyle: { color: "#F2F3F5", fontSize: 14 },
    },
    tooltip: {
      trigger: "item",
      formatter: "{b}: {d}%",
    },
    legend: {
      bottom: 0,
      textStyle: { color: "#949BA4" },
    },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        data: entries.map(([name, value]) => ({
          name,
          value: toPercent(value),
        })),
      },
    ],
  };
}

export function DemographicsCharts({
  ageGenderData,
  countryData,
  deviceData,
  trafficSources,
}: DemographicsChartsProps) {
  const hasAnyData =
    Boolean(ageGenderData && Object.keys(ageGenderData).length > 0) ||
    Boolean(countryData && Object.keys(countryData).length > 0) ||
    Boolean(deviceData && Object.keys(deviceData).length > 0) ||
    Boolean(trafficSources && Object.keys(trafficSources).length > 0);

  if (!hasAnyData) {
    return null;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-[#F2F3F5]">
        Audience insights
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {ageGenderData && Object.keys(ageGenderData).length > 0 ? (
          <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
            <h3 className="mb-3 text-sm font-medium text-[#DBDEE1]">
              Age and gender
            </h3>
            <BaseChart option={ageGenderOption(ageGenderData)} height={320} />
          </div>
        ) : null}

        {countryData && Object.keys(countryData).length > 0 ? (
          <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
            <h3 className="mb-3 text-sm font-medium text-[#DBDEE1]">
              Countries
            </h3>
            <BaseChart
              option={distributionBarOption("Country share", countryData)}
              height={320}
            />
          </div>
        ) : null}

        {deviceData && Object.keys(deviceData).length > 0 ? (
          <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
            <h3 className="mb-3 text-sm font-medium text-[#DBDEE1]">
              Device split
            </h3>
            <BaseChart
              option={pieOption("Device split", deviceData)}
              height={320}
            />
          </div>
        ) : null}

        {trafficSources && Object.keys(trafficSources).length > 0 ? (
          <div className="rounded-lg border border-[#3F4147] bg-[#313338] p-4">
            <h3 className="mb-3 text-sm font-medium text-[#DBDEE1]">
              Traffic sources
            </h3>
            <BaseChart
              option={pieOption("Traffic sources", trafficSources)}
              height={320}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
