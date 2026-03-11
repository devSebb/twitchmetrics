import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatNumber,
  formatPercent,
  formatDate,
  formatDuration,
  formatRelativeTime,
  formatDelta,
} from "./format";

describe("formatNumber", () => {
  it("formats numbers below 1000 as-is", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(42)).toBe("42");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1_234)).toBe("1.2K");
    expect(formatNumber(5_000)).toBe("5K");
    expect(formatNumber(99_900)).toBe("99.9K");
  });

  it("formats millions with M suffix", () => {
    expect(formatNumber(1_500_000)).toBe("1.5M");
    expect(formatNumber(10_000_000)).toBe("10M");
  });

  it("formats billions with B suffix", () => {
    expect(formatNumber(1_200_000_000)).toBe("1.2B");
  });

  it("handles negative numbers", () => {
    expect(formatNumber(-1_500)).toBe("-1.5K");
  });
});

describe("formatPercent", () => {
  it("formats positive values with + sign", () => {
    expect(formatPercent(0.123)).toBe("+12.3%");
    expect(formatPercent(1.0)).toBe("+100.0%");
  });

  it("formats negative values with - sign", () => {
    expect(formatPercent(-0.051)).toBe("-5.1%");
  });

  it("formats zero without sign", () => {
    expect(formatPercent(0)).toBe("0.0%");
  });

  it("respects custom decimals", () => {
    expect(formatPercent(0.12345, 2)).toBe("+12.35%");
    expect(formatPercent(0.1, 0)).toBe("+10%");
  });
});

describe("formatDate", () => {
  const date = new Date("2026-02-28T12:00:00Z");

  it("formats default style", () => {
    expect(formatDate(date)).toBe("Feb 28, 2026");
  });

  it("formats compact style", () => {
    expect(formatDate(date, "compact")).toBe("2/28");
  });

  it("formats ISO style", () => {
    expect(formatDate(date, "iso")).toBe("2026-02-28");
  });

  it("accepts string input", () => {
    expect(formatDate("2026-02-28T12:00:00Z", "iso")).toBe("2026-02-28");
  });

  it("handles single-digit months and days in ISO format", () => {
    expect(formatDate(new Date("2026-01-05T12:00:00Z"), "iso")).toBe(
      "2026-01-05",
    );
  });
});

describe("formatDuration", () => {
  it("formats seconds only for < 60s", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("formats minutes only for < 1h", () => {
    expect(formatDuration(2700)).toBe("45m");
    expect(formatDuration(60)).toBe("1m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(9240)).toBe("2h 34m");
    expect(formatDuration(3600)).toBe("1h 0m");
    expect(formatDuration(7200)).toBe("2h 0m");
  });
});

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for < 60 seconds', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime(new Date("2026-03-10T11:59:30Z"))).toBe(
      "just now",
    );
  });

  it("formats minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime(new Date("2026-03-10T11:55:00Z"))).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeTime(new Date("2026-03-10T11:59:00Z"))).toBe(
      "1 minute ago",
    );
  });

  it("formats hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime(new Date("2026-03-10T09:00:00Z"))).toBe(
      "3 hours ago",
    );
    expect(formatRelativeTime(new Date("2026-03-10T11:00:00Z"))).toBe(
      "1 hour ago",
    );
  });

  it("formats days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime(new Date("2026-03-08T12:00:00Z"))).toBe(
      "2 days ago",
    );
    expect(formatRelativeTime(new Date("2026-03-09T12:00:00Z"))).toBe(
      "1 day ago",
    );
  });

  it("formats months ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime(new Date("2026-02-08T12:00:00Z"))).toBe(
      "1 month ago",
    );
  });

  it("accepts string input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    expect(formatRelativeTime("2026-03-10T09:00:00Z")).toBe("3 hours ago");
  });
});

describe("formatDelta", () => {
  it("formats positive delta (up)", () => {
    const result = formatDelta(1234, 1000);
    expect(result.direction).toBe("up");
    expect(result.value).toBe("+234");
    expect(result.percent).toBe("+23.4%");
  });

  it("formats negative delta (down)", () => {
    const result = formatDelta(800, 1000);
    expect(result.direction).toBe("down");
    expect(result.value).toBe("-200");
    expect(result.percent).toBe("-20.0%");
  });

  it("formats zero delta (flat)", () => {
    const result = formatDelta(1000, 1000);
    expect(result.direction).toBe("flat");
    expect(result.value).toBe("0");
    expect(result.percent).toBe("0.0%");
  });

  it("handles zero previous value", () => {
    const result = formatDelta(100, 0);
    expect(result.direction).toBe("up");
    expect(result.percent).toBe("0.0%");
  });

  it("formats large deltas with compact notation", () => {
    const result = formatDelta(1_500_000, 1_000_000);
    expect(result.value).toBe("+500K");
  });
});
