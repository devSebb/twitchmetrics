export type TemplateConfig = {
  includes: string[];
  topCount: number | "500+";
  timePeriod: string;
  platforms: string[];
  metrics: string[];
};

export type ReportTemplateDefinition = {
  slug: string;
  name: string;
  description: string;
  priceInCents: number;
  config: TemplateConfig;
};

export const REPORT_TEMPLATES: ReportTemplateDefinition[] = [
  {
    slug: "top-10-games-30d-twitch",
    name: "Top 10 Games — Last 30 Days",
    description:
      "The 10 most-watched games on Twitch in the past 30 days, ranked by hours watched with average and peak viewer counts.",
    priceInCents: 25000,
    config: {
      includes: ["games"],
      topCount: 10,
      timePeriod: "30d",
      platforms: ["twitch"],
      metrics: ["hoursWatched", "avgViewers", "peakViewers"],
    },
  },
  {
    slug: "top-50-games-30d-twitch",
    name: "Top 50 Games — Last 30 Days",
    description:
      "The 50 most-watched games on Twitch in the past 30 days, ranked by hours watched.",
    priceInCents: 25000,
    config: {
      includes: ["games"],
      topCount: 50,
      timePeriod: "30d",
      platforms: ["twitch"],
      metrics: ["hoursWatched", "avgViewers", "peakViewers"],
    },
  },
  {
    slug: "top-10-games-90d-twitch",
    name: "Top 10 Games — Last 90 Days",
    description:
      "The 10 most-watched games on Twitch over the past 90 days with trend analysis.",
    priceInCents: 25000,
    config: {
      includes: ["games"],
      topCount: 10,
      timePeriod: "90d",
      platforms: ["twitch"],
      metrics: ["hoursWatched", "avgViewers", "peakViewers"],
    },
  },
  {
    slug: "top-10-channels-30d-twitch",
    name: "Top 10 Channels — Last 30 Days",
    description:
      "The 10 most-watched Twitch channels in the past 30 days with viewer and follower metrics.",
    priceInCents: 25000,
    config: {
      includes: ["channels"],
      topCount: 10,
      timePeriod: "30d",
      platforms: ["twitch"],
      metrics: ["avgViewers", "peakViewers"],
    },
  },
  {
    slug: "top-50-channels-30d-twitch",
    name: "Top 50 Channels — Last 30 Days",
    description: "The 50 most-watched Twitch channels in the past 30 days.",
    priceInCents: 25000,
    config: {
      includes: ["channels"],
      topCount: 50,
      timePeriod: "30d",
      platforms: ["twitch"],
      metrics: ["avgViewers", "peakViewers"],
    },
  },
];

// ─── Matching ────────────────────────────────────────────────────────────────

export type FormSnapshot = {
  include: "games" | "channels" | null;
  topCount: number | "500+" | null;
  timePeriod: string;
  platforms: string[];
  metrics: string[];
  channelGameSearch: string;
};

function sorted(arr: string[]) {
  return [...arr].sort();
}

export function matchTemplate(
  form: FormSnapshot,
): ReportTemplateDefinition | null {
  if (
    !form.include ||
    !form.topCount ||
    form.platforms.length === 0 ||
    form.metrics.length === 0
  )
    return null;
  if (form.channelGameSearch.trim()) return null; // custom filters can't match a fixed template

  for (const tpl of REPORT_TEMPLATES) {
    const c = tpl.config;
    if (
      c.includes[0] === form.include &&
      c.topCount === form.topCount &&
      c.timePeriod === form.timePeriod &&
      JSON.stringify(sorted(c.platforms)) ===
        JSON.stringify(sorted(form.platforms)) &&
      JSON.stringify(sorted(c.metrics)) === JSON.stringify(sorted(form.metrics))
    ) {
      return tpl;
    }
  }
  return null;
}

// ─── Complexity scoring ───────────────────────────────────────────────────────

export type ComplexityFlag = { label: string; score: number };

export const SALES_THRESHOLD = 3;

export function getComplexity(form: FormSnapshot): {
  score: number;
  flags: ComplexityFlag[];
  isSales: boolean;
} {
  const candidates: ComplexityFlag[] = [
    { label: "Top 500+ report", score: 4 },
    { label: "Custom date range", score: 4 },
    { label: "12-month lookback", score: 2 },
    { label: "6-month lookback", score: 1 },
    { label: "3+ platforms selected", score: 2 },
    { label: "Other streaming services included", score: 2 },
    { label: "5+ metrics selected", score: 1 },
    { label: "Specific channel / game filter", score: 1 },
  ];

  const triggered = [
    form.topCount === "500+",
    form.timePeriod === "custom",
    form.timePeriod === "12m",
    form.timePeriod === "6m",
    form.platforms.length >= 3,
    form.platforms.includes("otherStreaming"),
    form.metrics.length >= 5,
    !!form.channelGameSearch.trim(),
  ];

  const flags = candidates.filter((_, i) => triggered[i]);
  const score = flags.reduce((s, f) => s + f.score, 0);

  return { score, flags, isSales: score >= SALES_THRESHOLD };
}
