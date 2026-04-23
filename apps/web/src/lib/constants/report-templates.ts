// ─── Types ───────────────────────────────────────────────────────────────────

export type MetricKey =
  | "hoursWatched"
  | "avgViewers"
  | "peakViewers"
  | "topCreators"
  | "airtime"
  | "subscribers"
  | "gender"
  | "country"
  | "topCategories";

export type TemplateConfig = {
  includes: ["games"] | ["channels"];
  // number = Top N, "byId" = specific entities picked by user
  topCount: number | "byId";
  timePeriod: "30d" | "90d";
  platforms: ["twitch"];
  allowedMetrics: MetricKey[];
};

export type ReportTemplateDefinition = {
  slug: string;
  name: string;
  description: string;
  priceInCents: number;
  config: TemplateConfig;
};

export type FormSnapshot = {
  include: "games" | "channels" | null;
  topCount: number | "500+" | null;
  timePeriod: string;
  platforms: string[];
  metrics: string[];
  entityIds: string[];
  entityLabels: string[];
};

// ─── Catalog ─────────────────────────────────────────────────────────────────

const GAMES_METRICS: MetricKey[] = [
  "hoursWatched",
  "avgViewers",
  "peakViewers",
  "topCreators",
];

const CHANNELS_METRICS: MetricKey[] = [
  "avgViewers",
  "peakViewers",
  "gender",
  "country",
];

const TOP_N_VALUES = [10, 50, 100, 250] as const;
const PERIOD_VALUES = ["30d", "90d"] as const;

const PERIOD_LABELS: Record<"30d" | "90d", string> = {
  "30d": "Last 30 Days",
  "90d": "Last 90 Days",
};

function buildTopN(
  kind: "games" | "channels",
  allowed: MetricKey[],
): ReportTemplateDefinition[] {
  const out: ReportTemplateDefinition[] = [];
  for (const n of TOP_N_VALUES) {
    for (const p of PERIOD_VALUES) {
      out.push({
        slug: `top-${n}-${kind}-${p}-twitch`,
        name: `Top ${n} ${kind === "games" ? "Games" : "Channels"} — ${PERIOD_LABELS[p]}`,
        description:
          kind === "games"
            ? `The ${n} most-watched games on Twitch over the ${PERIOD_LABELS[p].toLowerCase()}.`
            : `The ${n} most-watched Twitch channels over the ${PERIOD_LABELS[p].toLowerCase()}.`,
        priceInCents: 25000,
        config: {
          includes: [kind],
          topCount: n,
          timePeriod: p,
          platforms: ["twitch"],
          allowedMetrics: allowed,
        },
      });
    }
  }
  return out;
}

function buildById(
  kind: "games" | "channels",
  allowed: MetricKey[],
): ReportTemplateDefinition[] {
  const label = kind === "games" ? "Games" : "Channels";
  return PERIOD_VALUES.map((p) => ({
    slug: `${kind}-by-id-${p}-twitch`,
    name: `Selected ${label} — ${PERIOD_LABELS[p]}`,
    description: `Metrics for a hand-picked list of ${kind} on Twitch over the ${PERIOD_LABELS[p].toLowerCase()}.`,
    priceInCents: 25000,
    config: {
      includes: [kind],
      topCount: "byId",
      timePeriod: p,
      platforms: ["twitch"],
      allowedMetrics: allowed,
    },
  }));
}

export const REPORT_TEMPLATES: ReportTemplateDefinition[] = [
  ...buildTopN("games", GAMES_METRICS),
  ...buildTopN("channels", CHANNELS_METRICS),
  ...buildById("games", GAMES_METRICS),
  ...buildById("channels", CHANNELS_METRICS),
];

// ─── Matching ────────────────────────────────────────────────────────────────

function isSubset(sub: string[], superset: readonly string[]): boolean {
  return sub.every((s) => superset.includes(s));
}

export function matchTemplate(
  form: FormSnapshot,
): ReportTemplateDefinition | null {
  if (!form.include || form.metrics.length === 0) return null;

  // Only Twitch-only selections can match a green template today.
  if (form.platforms.length !== 1 || form.platforms[0] !== "twitch")
    return null;

  // Only 30d / 90d are green.
  if (form.timePeriod !== "30d" && form.timePeriod !== "90d") return null;

  const hasEntities = form.entityIds.length > 0;
  const hasTopN =
    typeof form.topCount === "number" &&
    TOP_N_VALUES.includes(form.topCount as (typeof TOP_N_VALUES)[number]);

  // Exactly one of the two selectors must be set.
  if (hasEntities === hasTopN) return null;

  for (const tpl of REPORT_TEMPLATES) {
    const c = tpl.config;
    if (c.includes[0] !== form.include) continue;
    if (c.timePeriod !== form.timePeriod) continue;
    if (hasEntities && c.topCount !== "byId") continue;
    if (!hasEntities && c.topCount !== form.topCount) continue;
    if (!isSubset(form.metrics, c.allowedMetrics)) continue;
    return tpl;
  }
  return null;
}

// ─── Complexity / quote reasons ──────────────────────────────────────────────

export type QuoteReason = { label: string };

export function getQuoteReasons(form: FormSnapshot): QuoteReason[] {
  const reasons: QuoteReason[] = [];

  if (form.topCount === "500+") {
    reasons.push({ label: "Top 500+ list" });
  }
  if (form.timePeriod === "custom") {
    reasons.push({ label: "Custom date range" });
  }
  if (form.timePeriod === "12m") {
    reasons.push({ label: "12-month lookback" });
  }
  if (form.timePeriod === "6m") {
    reasons.push({ label: "6-month lookback" });
  }

  const nonTwitch = form.platforms.filter((p) => p !== "twitch");
  if (nonTwitch.length > 0) {
    reasons.push({
      label: `Platforms outside Twitch (${nonTwitch.join(", ")})`,
    });
  }

  // Metrics that no green template covers today.
  const GREEN_METRICS = new Set<string>([
    ...GAMES_METRICS,
    ...CHANNELS_METRICS,
  ]);
  const unsupportedMetrics = form.metrics.filter((m) => !GREEN_METRICS.has(m));
  if (unsupportedMetrics.length > 0) {
    reasons.push({
      label: `Metrics not auto-generated yet (${unsupportedMetrics.join(", ")})`,
    });
  }

  if (form.include === "games" && form.metrics.includes("gender")) {
    reasons.push({ label: "Demographics for games reports" });
  }
  if (form.include === "games" && form.metrics.includes("country")) {
    reasons.push({ label: "Country breakdown for games reports" });
  }

  return reasons;
}
