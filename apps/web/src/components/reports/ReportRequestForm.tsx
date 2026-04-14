"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TimePeriod = "30d" | "90d" | "6m" | "12m" | "custom";
type TopCount = 10 | 50 | 100;
type DataDepth = "level1" | "level2";

type Metrics = {
  // Audience
  avgPeakViewers: boolean;
  uniqueViewers: boolean;
  followersGrowth: boolean;
  viewerRetention: boolean;
  geoDistribution: boolean;
  // Engagement
  chatMessages: boolean;
  watchTime: boolean;
  streamFrequency: boolean;
  likesCommentsShares: boolean;
  engagementRate: boolean;
  // Content
  topPerformingStreams: boolean;
  contentCategories: boolean;
  streamDurationAnalysis: boolean;
  scheduleConsistency: boolean;
  // Monetization
  subscriptions: boolean;
  adsImpact: boolean;
  sponsorshipVisibility: boolean;
  estimatedMediaValue: boolean;
};

type ReportRequestFormProps = {
  name: string;
  email: string;
  company: string;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E32C19] text-[10px] font-bold text-white">
        {number}
      </span>
      <span className="text-sm font-semibold text-[#F2F3F5]">{children}</span>
    </div>
  );
}

function CheckboxItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center gap-2 text-left"
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-[#E32C19] bg-[#E32C19]"
            : "border-[#4E5058] bg-[#2B2D31]"
        }`}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span className="text-sm text-[#DBDEE1]">{label}</span>
    </button>
  );
}

function MetricGroup({
  title,
  items,
  metrics,
  toggle,
}: {
  title: string;
  items: { key: keyof Metrics; label: string }[];
  metrics: Metrics;
  toggle: (key: keyof Metrics) => void;
}) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
        {title}
      </p>
      <div className="space-y-2">
        {items.map(({ key, label }) => (
          <CheckboxItem
            key={key}
            checked={metrics[key]}
            onChange={() => toggle(key)}
            label={label}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ReportRequestForm({
  name,
  email,
  company,
}: ReportRequestFormProps) {
  // Q1
  const [includesGames, setIncludesGames] = useState(false);
  const [includesChannels, setIncludesChannels] = useState(false);

  // Q2
  const [topCount, setTopCount] = useState<TopCount | null>(null);
  const [channelGameSearch, setChannelGameSearch] = useState("");

  // Q3
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("30d");
  const [customRange, setCustomRange] = useState("");

  // Q4
  const [platforms, setPlatforms] = useState({
    twitch: false,
    youtube: false,
    instagram: false,
    x: false,
    tiktok: false,
  });

  // Q5
  const [metrics, setMetrics] = useState<Metrics>({
    avgPeakViewers: false,
    uniqueViewers: false,
    followersGrowth: false,
    viewerRetention: false,
    geoDistribution: false,
    chatMessages: false,
    watchTime: false,
    streamFrequency: false,
    likesCommentsShares: false,
    engagementRate: false,
    topPerformingStreams: false,
    contentCategories: false,
    streamDurationAnalysis: false,
    scheduleConsistency: false,
    subscriptions: false,
    adsImpact: false,
    sponsorshipVisibility: false,
    estimatedMediaValue: false,
  });

  // Q6
  const [dataDepth, setDataDepth] = useState<DataDepth | null>(null);

  // Submission
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  function toggleMetric(key: keyof Metrics) {
    setMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePlatform(key: keyof typeof platforms) {
    setPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit() {
    setSubmitState("submitting");

    const details = {
      includes: [
        ...(includesGames ? ["games"] : []),
        ...(includesChannels ? ["channels"] : []),
      ],
      topCount,
      channelGameSearch: channelGameSearch.trim() || null,
      timePeriod,
      customRange: timePeriod === "custom" ? customRange.trim() : null,
      platforms: Object.entries(platforms)
        .filter(([, v]) => v)
        .map(([k]) => k),
      metrics: Object.entries(metrics)
        .filter(([, v]) => v)
        .map(([k]) => k),
      dataDepth,
    };

    try {
      const res = await fetch("/api/reports/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, details }),
      });

      if (!res.ok) throw new Error("Failed to submit");
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "6m", label: "Last 6 months" },
    { value: "12m", label: "Last 12 months" },
    { value: "custom", label: "Custom range" },
  ];

  const TOP_COUNTS: TopCount[] = [10, 50, 100];

  const AUDIENCE_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "avgPeakViewers", label: "Avg/peak viewers" },
    { key: "uniqueViewers", label: "Unique viewers" },
    { key: "followersGrowth", label: "Followers growth" },
    { key: "viewerRetention", label: "Viewer retention" },
    { key: "geoDistribution", label: "Geo distribution" },
  ];

  const ENGAGEMENT_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "chatMessages", label: "Chat messages" },
    { key: "watchTime", label: "Watch time" },
    { key: "streamFrequency", label: "Stream frequency" },
    { key: "likesCommentsShares", label: "Likes / comments / shares" },
    { key: "engagementRate", label: "Engagement rate" },
  ];

  const CONTENT_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "topPerformingStreams", label: "Top performing streams/videos" },
    { key: "contentCategories", label: "Content categories" },
    { key: "streamDurationAnalysis", label: "Stream duration analysis" },
    { key: "scheduleConsistency", label: "Schedule consistency" },
  ];

  const MONETIZATION_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "subscriptions", label: "Subscriptions" },
    { key: "adsImpact", label: "Ads impact" },
    { key: "sponsorshipVisibility", label: "Sponsorship visibility" },
    { key: "estimatedMediaValue", label: "Estimated media value (EMV)" },
  ];

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitState === "success") {
    return (
      <div className="rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/5 px-8 py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#22c55e]/15">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#F2F3F5]">Request Submitted</h3>
        <p className="mt-2 text-sm text-[#949BA4]">
          We&apos;ll reach out at{" "}
          <span className="font-medium text-[#DBDEE1]">{email}</span> with your
          custom report details and pricing.
        </p>
        <p className="mt-1 text-xs text-[#949BA4]">
          Expect a response within 1–2 business days.
        </p>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl border border-[#3F4147] bg-[#2B2D31]">
      {/* Card header */}
      <div className="border-b border-[#3F4147] px-6 py-5">
        <div className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#949BA4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          <h2 className="text-base font-bold text-[#F2F3F5]">
            Request a Report
          </h2>
        </div>
        <p className="mt-1 text-xs text-[#949BA4]">
          Fill out the form and our team will reach out with your quote.
        </p>
      </div>

      {/* Two-column form body */}
      <div className="grid gap-0 lg:grid-cols-2">
        {/* ── Left column ── */}
        <div className="space-y-7 border-b border-[#3F4147] px-6 py-6 lg:border-b-0 lg:border-r">
          {/* Q1 */}
          <div>
            <SectionLabel number={1}>
              What should the report include?
            </SectionLabel>
            <div className="flex gap-6">
              <CheckboxItem
                checked={includesGames}
                onChange={() => setIncludesGames((v) => !v)}
                label="Games"
              />
              <CheckboxItem
                checked={includesChannels}
                onChange={() => setIncludesChannels((v) => !v)}
                label="Channels"
              />
            </div>
          </div>

          {/* Q2 */}
          <div>
            <SectionLabel number={2}>
              Who should the report include?
            </SectionLabel>
            <div className="mb-3 flex gap-2">
              {TOP_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTopCount(topCount === n ? null : n)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    topCount === n
                      ? "bg-[#F2F3F5] text-[#1E1F22]"
                      : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]"
                  }`}
                >
                  Top {n}
                </button>
              ))}
            </div>
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5058]"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={channelGameSearch}
                onChange={(e) => setChannelGameSearch(e.target.value)}
                placeholder="Choose channels / games"
                className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] py-2 pl-8 pr-3 text-sm text-[#DBDEE1] placeholder-[#4E5058] outline-none transition-colors focus:border-[#E32C19]/50"
              />
            </div>
          </div>

          {/* Q3 */}
          <div>
            <SectionLabel number={3}>
              What time period should the report cover?
            </SectionLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {TIME_PERIODS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTimePeriod(value)}
                  className={`text-sm transition-colors ${
                    timePeriod === value
                      ? "font-semibold text-[#E32C19] underline underline-offset-2"
                      : "text-[#949BA4] hover:text-[#DBDEE1]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {timePeriod === "custom" && (
              <input
                type="text"
                value={customRange}
                onChange={(e) => setCustomRange(e.target.value)}
                placeholder="e.g. Jan 2025 – Mar 2025"
                className="mt-3 w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#DBDEE1] placeholder-[#4E5058] outline-none focus:border-[#E32C19]/50"
              />
            )}
          </div>

          {/* Q4 */}
          <div>
            <SectionLabel number={4}>
              Which platforms do you want data from?
            </SectionLabel>
            <div className="space-y-2.5">
              {(
                [
                  { key: "twitch", label: "Twitch" },
                  { key: "youtube", label: "Youtube" },
                  { key: "instagram", label: "Instagram" },
                  { key: "x", label: "X" },
                  { key: "tiktok", label: "TikTok" },
                ] as { key: keyof typeof platforms; label: string }[]
              ).map(({ key, label }) => (
                <CheckboxItem
                  key={key}
                  checked={platforms[key]}
                  onChange={() => togglePlatform(key)}
                  label={label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right column ── */}
        <div className="px-6 py-6">
          {/* Q5 */}
          <SectionLabel number={5}>
            Which metrics do you want included?
          </SectionLabel>
          <div className="grid grid-cols-2 gap-x-6">
            {/* Left sub-column: Audience + Engagement */}
            <div>
              <MetricGroup
                title="Audience"
                items={AUDIENCE_METRICS}
                metrics={metrics}
                toggle={toggleMetric}
              />
              <MetricGroup
                title="Engagement"
                items={ENGAGEMENT_METRICS}
                metrics={metrics}
                toggle={toggleMetric}
              />
            </div>
            {/* Right sub-column: Content + Monetization */}
            <div>
              <MetricGroup
                title="Content"
                items={CONTENT_METRICS}
                metrics={metrics}
                toggle={toggleMetric}
              />
              <MetricGroup
                title="Monetization"
                items={MONETIZATION_METRICS}
                metrics={metrics}
                toggle={toggleMetric}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 6: Data Depth (full width) ── */}
      <div className="border-t border-[#3F4147] px-6 py-6">
        <SectionLabel number={6}>Data Depth</SectionLabel>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:max-w-lg">
          {/* Level 1 */}
          <button
            type="button"
            onClick={() =>
              setDataDepth(dataDepth === "level1" ? null : "level1")
            }
            className={`rounded-lg border p-4 text-left transition-colors ${
              dataDepth === "level1"
                ? "border-[#E32C19] bg-[#E32C19]/5"
                : "border-[#3F4147] bg-[#313338] hover:border-[#4E5058]"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  dataDepth === "level1"
                    ? "border-[#E32C19] bg-[#E32C19]"
                    : "border-[#4E5058] bg-[#2B2D31]"
                }`}
              >
                {dataDepth === "level1" && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-sm font-semibold text-[#F2F3F5]">
                Level 1
              </span>
            </div>
            <ul className="space-y-1 pl-1">
              {["High-level metrics", "Summary insights", "Clean charts"].map(
                (item) => (
                  <li
                    key={item}
                    className="flex items-start gap-1.5 text-xs text-[#949BA4]"
                  >
                    <span className="mt-0.5 text-[#4E5058]">•</span>
                    {item}
                  </li>
                ),
              )}
            </ul>
          </button>

          {/* Level 2 */}
          <button
            type="button"
            onClick={() =>
              setDataDepth(dataDepth === "level2" ? null : "level2")
            }
            className={`rounded-lg border p-4 text-left transition-colors ${
              dataDepth === "level2"
                ? "border-[#E32C19] bg-[#E32C19]/5"
                : "border-[#3F4147] bg-[#313338] hover:border-[#4E5058]"
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  dataDepth === "level2"
                    ? "border-[#E32C19] bg-[#E32C19]"
                    : "border-[#4E5058] bg-[#2B2D31]"
                }`}
              >
                {dataDepth === "level2" && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-sm font-semibold text-[#F2F3F5]">
                Level 2
              </span>
            </div>
            <ul className="space-y-1 pl-1">
              {[
                "Time-series data",
                "Viewer behavior",
                "Engagement patterns",
                "Content performance",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-1.5 text-xs text-[#949BA4]"
                >
                  <span className="mt-0.5 text-[#4E5058]">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </button>
        </div>
      </div>

      {/* ── Footer: submit ── */}
      <div className="flex items-center justify-between border-t border-[#3F4147] px-6 py-5">
        <p className="text-xs text-[#949BA4]">
          Submitting as{" "}
          <span className="font-medium text-[#DBDEE1]">{name}</span>
          {" · "}
          <span className="font-medium text-[#DBDEE1]">{email}</span>
        </p>
        <div className="flex items-center gap-3">
          {submitState === "error" && (
            <p className="text-xs text-[#ef4444]">
              Something went wrong — please try again.
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitState === "submitting"}
            className="rounded-lg bg-[#E32C19] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
          >
            {submitState === "submitting" ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  );
}
