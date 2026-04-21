"use client";

import { useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

type TimePeriod = "30d" | "90d" | "6m" | "12m" | "custom";
type TopCount = 50 | 100 | 250 | "500+";

type Metrics = {
  hoursWatched: boolean;
  avgViewers: boolean;
  peakViewers: boolean;
  topCreators: boolean;
  airtime: boolean;
  subscribers: boolean;
  // Audience
  gender: boolean;
  country: boolean;
  topCategories: boolean;
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

// ─── Main Component ──────────────────────────────────────────────────────────

export function ReportRequestForm({
  name,
  email,
  company,
}: ReportRequestFormProps) {
  // Q1
  const [includesGames, setIncludesGames] = useState(false);
  const [includesChannels, setIncludesChannels] = useState(false);
  const [includesCreatorList, setIncludesCreatorList] = useState(false);

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
    kick: false,
    otherStreaming: false,
  });

  // Q5
  const [metrics, setMetrics] = useState<Metrics>({
    hoursWatched: false,
    avgViewers: false,
    peakViewers: false,
    topCreators: false,
    airtime: false,
    subscribers: false,
    gender: false,
    country: false,
    topCategories: false,
  });

  // T&C
  const [acceptedTerms, setAcceptedTerms] = useState(false);

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
        ...(includesCreatorList ? ["creator_list"] : []),
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

  const TOP_COUNTS: TopCount[] = [50, 100, 250, "500+"];

  const MAIN_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "hoursWatched", label: "Hours Watched" },
    { key: "avgViewers", label: "Average Viewers" },
    { key: "peakViewers", label: "Peak Viewers" },
    { key: "topCreators", label: "Top Creators" },
    { key: "airtime", label: "Airtime" },
    { key: "subscribers", label: "Subscribers" },
  ];

  const AUDIENCE_METRICS: { key: keyof Metrics; label: string }[] = [
    { key: "gender", label: "Gender" },
    { key: "country", label: "Country" },
    { key: "topCategories", label: "Top Categories" },
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
            <div className="flex flex-wrap gap-6">
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
              <CheckboxItem
                checked={includesCreatorList}
                onChange={() => setIncludesCreatorList((v) => !v)}
                label="Creator List"
              />
            </div>
          </div>

          {/* Q2 */}
          <div>
            <SectionLabel number={2}>
              Who should the report include?
            </SectionLabel>
            <div className="mb-3 flex flex-wrap gap-2">
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {(
                [
                  { key: "twitch", label: "Twitch" },
                  { key: "x", label: "X" },
                  { key: "youtube", label: "Youtube" },
                  { key: "kick", label: "Kick" },
                  { key: "instagram", label: "Instagram" },
                  {
                    key: "otherStreaming",
                    label: "Other live-streaming services",
                  },
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
            {/* Left sub-column: main metrics */}
            <div className="space-y-2">
              {MAIN_METRICS.map(({ key, label }) => (
                <CheckboxItem
                  key={key}
                  checked={metrics[key]}
                  onChange={() => toggleMetric(key)}
                  label={label}
                />
              ))}
            </div>
            {/* Right sub-column: Audience */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
                Audience
              </p>
              <div className="space-y-2">
                {AUDIENCE_METRICS.map(({ key, label }) => (
                  <CheckboxItem
                    key={key}
                    checked={metrics[key]}
                    onChange={() => toggleMetric(key)}
                    label={label}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer: T&C + submit ── */}
      <div className="border-t border-[#3F4147] px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setAcceptedTerms((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                acceptedTerms
                  ? "border-[#E32C19] bg-[#E32C19]"
                  : "border-[#4E5058] bg-[#2B2D31]"
              }`}
            >
              {acceptedTerms && (
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
            <span className="text-sm text-[#DBDEE1]">
              I accept the{" "}
              <span className="text-[#E32C19] underline underline-offset-2">
                Terms &amp; Conditions
              </span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            {submitState === "error" && (
              <p className="text-xs text-[#ef4444]">
                Something went wrong — please try again.
              </p>
            )}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitState === "submitting" || !acceptedTerms}
              className="w-full rounded-lg bg-[#E32C19] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitState === "submitting" ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
