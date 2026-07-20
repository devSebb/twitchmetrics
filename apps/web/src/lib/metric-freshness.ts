export const VERIFIED_LIVE_MAX_AGE_MS = 30 * 60 * 1000;

const POSSIBLY_OUTDATED_AGE_MS = 48 * 60 * 60 * 1000;
const OUTDATED_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type MetricFreshness = {
  relativeTime: string;
  state: "fresh" | "possibly_outdated" | "outdated";
};

function toDate(value: Date | string): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLatestTimestamp(
  values: Array<Date | string | null | undefined>,
): Date | null {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) return latest;
    const date = toDate(value);
    if (!date) return latest;
    return !latest || date.getTime() > latest.getTime() ? date : latest;
  }, null);
}

export function isRecentObservation(
  value: Date | string | null | undefined,
  maxAgeMs = VERIFIED_LIVE_MAX_AGE_MS,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const date = toDate(value);
  if (!date) return false;

  const ageMs = now - date.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function getMetricFreshness(
  value: Date | string,
  now = Date.now(),
): MetricFreshness | null {
  const date = toDate(value);
  if (!date) return null;

  const ageMs = Math.max(0, now - date.getTime());
  const seconds = Math.floor(ageMs / 1000);
  let relativeTime: string;

  if (seconds < 60) {
    relativeTime = "just now";
  } else if (seconds < 60 * 60) {
    relativeTime = `${Math.floor(seconds / 60)}m ago`;
  } else if (seconds < 24 * 60 * 60) {
    relativeTime = `${Math.floor(seconds / (60 * 60))}h ago`;
  } else if (seconds < 30 * 24 * 60 * 60) {
    relativeTime = `${Math.floor(seconds / (24 * 60 * 60))}d ago`;
  } else {
    relativeTime = `${Math.floor(seconds / (30 * 24 * 60 * 60))}mo ago`;
  }

  return {
    relativeTime,
    state:
      ageMs > OUTDATED_AGE_MS
        ? "outdated"
        : ageMs > POSSIBLY_OUTDATED_AGE_MS
          ? "possibly_outdated"
          : "fresh",
  };
}
