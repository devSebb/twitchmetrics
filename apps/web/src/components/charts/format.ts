import { THEME } from "@/lib/constants/theme";
import { formatDate, formatNumber } from "@/lib/utils/format";

/** Axis-label formatter shared by every value axis. */
export function axisNumber(value: number): string {
  return formatNumber(value);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const utcCompactFormatter = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  timeZone: "UTC",
});

const utcFullFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const localHourFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
});

const localDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Date label for chart axes and tooltip titles. Calendar-date strings
 * ("2026-07-20") are timezone-less day buckets and are labeled in UTC so the
 * label always names the bucketed day; full ISO instants are labeled in the
 * viewer's local time.
 */
export function chartDateLabel(
  value: string,
  style: "compact" | "full" = "compact",
): string {
  if (DATE_ONLY.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return style === "compact"
      ? utcCompactFormatter.format(date)
      : utcFullFormatter.format(date);
  }
  return formatDate(value, style === "compact" ? "compact" : "default");
}

/** Hour-granularity axis label for intra-day series ("3 PM"). */
export function chartTimeLabel(value: string): string {
  return localHourFormatter.format(new Date(value));
}

/** Date + time tooltip title for intra-day series ("Jul 27, 3:00 PM"). */
export function chartDateTimeLabel(value: string): string {
  return localDateTimeFormatter.format(new Date(value));
}

/** Text color for a signed delta, matching CHART_TREND_COLORS semantics. */
export function trendColor(delta: number): string {
  if (delta > 0) return THEME.colors.success;
  if (delta < 0) return THEME.colors.error;
  return THEME.colors.textMuted;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type TooltipRow = {
  /** Optional prefix rendered before the value ("Twitch: "). */
  label?: string;
  /** Main text of the row; bold unless `plain`. */
  value: string;
  /** Series bullet color rendered at the start of the row. */
  bullet?: string;
  /** Text color override (e.g. trendColor(delta)). */
  color?: string;
  small?: boolean;
  plain?: boolean;
};

/**
 * The one tooltip body used by every chart with a custom formatter, so all
 * tooltips share typography. Background, border, and base text style come
 * from the registered "twitchmetrics" theme — never restyle those per chart.
 */
export function tooltipHtml(title: string, rows: TooltipRow[]): string {
  const body = rows
    .map((row) => {
      const styles = [
        row.color ? `color:${row.color}` : "",
        row.small ? "font-size:12px" : "",
      ]
        .filter(Boolean)
        .join(";");
      const bullet = row.bullet
        ? `<span style="color:${row.bullet}">●</span> `
        : "";
      const label = row.label ? `${esc(row.label)}: ` : "";
      const value = row.plain ? esc(row.value) : `<b>${esc(row.value)}</b>`;
      return `<div${styles ? ` style="${styles}"` : ""}>${bullet}${label}${value}</div>`;
    })
    .join("");
  return `<div style="font-size:13px"><div style="margin-bottom:4px;color:${THEME.colors.textMuted}">${esc(title)}</div>${body}</div>`;
}
