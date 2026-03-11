const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Format a number with compact notation.
 * 1234 → "1.2K", 1_500_000 → "1.5M", 1_200_000_000 → "1.2B", 999 → "999"
 */
export function formatNumber(n: number): string {
  return compactFormatter.format(n);
}

/**
 * Format a decimal as a percentage string with sign.
 * 0.123 → "+12.3%", -0.051 → "-5.1%", 0 → "0.0%"
 */
export function formatPercent(n: number, decimals = 1): string {
  const pct = n * 100;
  const abs = Math.abs(pct).toFixed(decimals);
  if (pct > 0) return `+${abs}%`;
  if (pct < 0) return `-${abs}%`;
  return `${abs}%`;
}

const defaultDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
});

/**
 * Format a date in the given style.
 * default: "Feb 28, 2026", compact: "2/28", iso: "2026-02-28"
 */
export function formatDate(
  d: Date | string,
  format: "default" | "compact" | "iso" = "default",
): string {
  const date = typeof d === "string" ? new Date(d) : d;

  switch (format) {
    case "compact":
      return compactDateFormatter.format(date);
    case "iso": {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    default:
      return defaultDateFormatter.format(date);
  }
}

/**
 * Format seconds into a human-readable duration.
 * 9240 → "2h 34m", 2700 → "45m", 45 → "45s", 3600 → "1h 0m"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MONTH = 2592000; // 30 days
const YEAR = 31536000; // 365 days

/**
 * Format a date as a relative time string.
 * "3 hours ago", "just now", "2 days ago", "1 month ago"
 */
export function formatRelativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} ${mins === 1 ? "minute" : "minutes"} ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (diff < MONTH) {
    const days = Math.floor(diff / DAY);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (diff < YEAR) {
    const months = Math.floor(diff / MONTH);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  }
  const years = Math.floor(diff / YEAR);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}

/**
 * Calculate and format the delta between two values.
 * (1234, 1000) → { value: "+234", percent: "+23.4%", direction: "up" }
 */
export function formatDelta(
  current: number,
  previous: number,
): { value: string; percent: string; direction: "up" | "down" | "flat" } {
  const diff = current - previous;

  let direction: "up" | "down" | "flat";
  if (diff > 0) direction = "up";
  else if (diff < 0) direction = "down";
  else direction = "flat";

  const value =
    diff > 0
      ? `+${formatNumber(diff)}`
      : diff < 0
        ? `-${formatNumber(Math.abs(diff))}`
        : "0";

  const pctRaw = previous === 0 ? 0 : diff / previous;
  const percent = formatPercent(pctRaw);

  return { value, percent, direction };
}
