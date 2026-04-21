"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { matchTemplate, getComplexity } from "@/lib/constants/report-templates";
import type { FormSnapshot } from "@/lib/constants/report-templates";
import { SalesModal } from "./SalesModal";

// ─── Types ───────────────────────────────────────────────────────────────────

type Include = "games" | "channels";
type TimePeriod = "30d" | "90d" | "6m" | "12m" | "custom";
type TopCount = 50 | 100 | 250 | "500+";

type MetricKey =
  | "hoursWatched"
  | "avgViewers"
  | "peakViewers"
  | "topCreators"
  | "airtime"
  | "subscribers"
  | "gender"
  | "country"
  | "topCategories";

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
  disabled = false,
  disabledReason,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      title={disabled ? disabledReason : undefined}
      className={`flex items-center gap-2 text-left transition-opacity ${disabled ? "cursor-not-allowed opacity-35" : ""}`}
    >
      <div
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked && !disabled
            ? "border-[#E32C19] bg-[#E32C19]"
            : "border-[#4E5058] bg-[#2B2D31]"
        }`}
      >
        {checked && !disabled && (
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

// ─── Main component ──────────────────────────────────────────────────────────

export function ReportRequestForm({
  name,
  email,
  company,
}: ReportRequestFormProps) {
  const router = useRouter();

  // Q1 — single selection
  const [include, setInclude] = useState<Include | null>(null);

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
  const [metrics, setMetrics] = useState<Record<MetricKey, boolean>>({
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

  // T&C + submission
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [salesOpen, setSalesOpen] = useState(false);

  // ── Derived: disabled metrics ─────────────────────────────────────────────
  const disabledMetrics = useMemo<Set<MetricKey>>(() => {
    const s = new Set<MetricKey>();
    if (include === "games" || include === "channels") {
      s.add("airtime");
      s.add("subscribers");
      s.add("topCategories");
    }
    if (include === "channels") {
      s.add("topCreators");
    }
    return s;
  }, [include]);

  // ── Handle Q1 change, auto-clearing incompatible metrics ─────────────────
  function handleIncludeChange(val: Include) {
    const next = include === val ? null : val;
    setInclude(next);
    if (next) {
      const willDisable = new Set<MetricKey>();
      if (next === "games" || next === "channels") {
        willDisable.add("airtime");
        willDisable.add("subscribers");
        willDisable.add("topCategories");
      }
      if (next === "channels") willDisable.add("topCreators");
      setMetrics((m) => {
        const updated = { ...m };
        willDisable.forEach((k) => {
          updated[k] = false;
        });
        return updated;
      });
    }
  }

  function toggleMetric(key: MetricKey) {
    if (disabledMetrics.has(key)) return;
    setMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function togglePlatform(key: keyof typeof platforms) {
    setPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // ── Derived: form snapshot ────────────────────────────────────────────────
  const formSnapshot = useMemo<FormSnapshot>(
    () => ({
      include,
      topCount,
      timePeriod,
      platforms: Object.entries(platforms)
        .filter(([, v]) => v)
        .map(([k]) => k),
      metrics: (Object.entries(metrics) as [MetricKey, boolean][])
        .filter(([k, v]) => v && !disabledMetrics.has(k))
        .map(([k]) => k),
      channelGameSearch,
    }),
    [
      include,
      topCount,
      timePeriod,
      platforms,
      metrics,
      channelGameSearch,
      disabledMetrics,
    ],
  );

  // ── Derived: complexity + template match ──────────────────────────────────
  const { score, flags, isSales } = useMemo(
    () => getComplexity(formSnapshot),
    [formSnapshot],
  );
  const matchedTemplate = useMemo(
    () => (!isSales ? matchTemplate(formSnapshot) : null),
    [isSales, formSnapshot],
  );

  const isFormReady =
    !!include &&
    !!topCount &&
    formSnapshot.platforms.length > 0 &&
    formSnapshot.metrics.length > 0;

  const outcome: "auto" | "sales" | "incomplete" = !isFormReady
    ? "incomplete"
    : matchedTemplate
      ? "auto"
      : "sales";

  // ── Submission ────────────────────────────────────────────────────────────
  async function handleBuyReport() {
    if (!acceptedTerms || outcome !== "auto") return;
    setSubmitState("submitting");

    try {
      const res = await fetch("/api/reports/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, formSnapshot }),
      });
      const data = (await res.json()) as {
        mode?: string;
        sessionUrl?: string;
        successUrl?: string;
        error?: string;
      };

      if (!res.ok || data.error)
        throw new Error(data.error ?? "Checkout failed");

      if (data.mode === "mock" && data.successUrl) {
        router.push(data.successUrl);
      } else if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      }
    } catch {
      setSubmitState("error");
    }
  }

  // ── Constants ─────────────────────────────────────────────────────────────
  const TIME_PERIODS: { value: TimePeriod; label: string }[] = [
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "6m", label: "Last 6 months" },
    { value: "12m", label: "Last 12 months" },
    { value: "custom", label: "Custom range" },
  ];

  const TOP_COUNTS: TopCount[] = [50, 100, 250, "500+"];

  const MAIN_METRICS: {
    key: MetricKey;
    label: (inc: Include | null) => string;
  }[] = [
    { key: "hoursWatched", label: () => "Hours Watched" },
    { key: "avgViewers", label: () => "Average Viewers" },
    { key: "peakViewers", label: () => "Peak Viewers" },
    {
      key: "topCreators",
      label: (inc) => (inc === "channels" ? "Top Channels" : "Top Creators"),
    },
    { key: "airtime", label: () => "Airtime" },
    { key: "subscribers", label: () => "Subscribers" },
  ];

  const AUDIENCE_METRICS: { key: MetricKey; label: string }[] = [
    { key: "gender", label: "Gender" },
    { key: "country", label: "Country" },
    { key: "topCategories", label: "Top Categories" },
  ];

  return (
    <>
      <SalesModal
        open={salesOpen}
        onClose={() => setSalesOpen(false)}
        flags={flags}
        score={score}
        name={name}
        email={email}
        company={company}
      />

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
                {(["games", "channels"] as Include[]).map((val) => (
                  <CheckboxItem
                    key={val}
                    checked={include === val}
                    onChange={() => handleIncludeChange(val)}
                    label={val.charAt(0).toUpperCase() + val.slice(1)}
                  />
                ))}
                <CheckboxItem
                  checked={false}
                  onChange={() => {}}
                  label="Creator List"
                  disabled
                  disabledReason="Coming soon"
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
            <SectionLabel number={5}>
              Which metrics do you want included?
            </SectionLabel>

            {!include && (
              <p className="mb-4 text-xs text-[#4E5058]">
                Select a report type above to see available metrics.
              </p>
            )}

            <div className="grid grid-cols-2 gap-x-6">
              <div className="space-y-2.5">
                {MAIN_METRICS.map(({ key, label }) => {
                  const isDisabled = disabledMetrics.has(key);
                  return (
                    <CheckboxItem
                      key={key}
                      checked={metrics[key] && !isDisabled}
                      onChange={() => toggleMetric(key)}
                      label={label(include)}
                      disabled={isDisabled}
                      disabledReason={`Not available for ${include ?? "this"} reports`}
                    />
                  );
                })}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
                  Audience
                </p>
                <div className="space-y-2.5">
                  {AUDIENCE_METRICS.map(({ key, label }) => {
                    const isDisabled = disabledMetrics.has(key);
                    return (
                      <CheckboxItem
                        key={key}
                        checked={metrics[key] && !isDisabled}
                        onChange={() => toggleMetric(key)}
                        label={label}
                        disabled={isDisabled}
                        disabledReason={`Not available for ${include ?? "this"} reports`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Template match / complexity feedback */}
            {isFormReady && (
              <div
                className={`mt-6 rounded-lg border px-4 py-3 text-xs ${
                  outcome === "auto"
                    ? "border-[#22c55e]/30 bg-[#22c55e]/5 text-[#22c55e]"
                    : "border-[#E32C19]/30 bg-[#E32C19]/5 text-[#E32C19]"
                }`}
              >
                {outcome === "auto" && matchedTemplate && (
                  <div className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 shrink-0"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    <span>
                      Instant report available —{" "}
                      <strong>{matchedTemplate.name}</strong>
                    </span>
                  </div>
                )}
                {outcome === "sales" && (
                  <div className="flex items-start gap-2">
                    <svg
                      className="mt-0.5 shrink-0"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      {isSales
                        ? "This configuration requires a custom quote."
                        : "No instant template for this combination — our team will handle it."}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
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

              {outcome === "sales" && (
                <button
                  type="button"
                  onClick={() => setSalesOpen(true)}
                  disabled={!acceptedTerms || !isFormReady}
                  className="w-full rounded-lg border border-[#E32C19] px-6 py-2.5 text-sm font-semibold text-[#E32C19] transition-colors hover:bg-[#E32C19]/10 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                >
                  Contact Sales
                </button>
              )}

              {outcome === "auto" && (
                <button
                  type="button"
                  onClick={handleBuyReport}
                  disabled={!acceptedTerms || submitState === "submitting"}
                  className="w-full rounded-lg bg-[#E32C19] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {submitState === "submitting" ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Processing…
                    </span>
                  ) : (
                    "Get Report — $250"
                  )}
                </button>
              )}

              {outcome === "incomplete" && (
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg bg-[#383A40] px-6 py-2.5 text-sm font-semibold text-[#4E5058] sm:w-auto"
                >
                  Complete the form
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
