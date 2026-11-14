/**
 * Social-audience (DemographicsPro) age buckets as the profile shows them.
 *
 * Labels follow Stream Hatchet BI (QA 2026-11-13): BI shows the same DP
 * values under "16 & under, 17-19, 20-24, 25-29, 30-34, 35+", one year below
 * the DP key names and with everything from 35 up in one bar. Each entry is
 * the display label and the DP bucket keys it adds up, in display order.
 */
export const SOCIAL_AGE_LABELS: [string, string[]][] = [
  ["16 & under", ["age 17 and under"]],
  ["17-19", ["age 18 to 20"]],
  ["20-24", ["age 21 to 24"]],
  ["25-29", ["age 25 to 29"]],
  ["30-34", ["age 30 to 34"]],
  ["35+", ["age 35 to 44", "age 45 to 54", "age 55 to 64", "age 65 and over"]],
];

/** Map a 0-100 keyed distribution to ordered non-zero bars (0-1 scale). */
export function labeledBars(
  data: Record<string, number> | null,
  labels: [string, string[]][],
): { range: string; percentage: number }[] | null {
  if (!data) return null;
  const bars = labels
    .map(([label, keys]) => ({
      range: label,
      percentage: keys.reduce((sum, key) => sum + (data[key] ?? 0), 0) / 100,
    }))
    .filter((bar) => bar.percentage > 0);
  return bars.length > 0 ? bars : null;
}
