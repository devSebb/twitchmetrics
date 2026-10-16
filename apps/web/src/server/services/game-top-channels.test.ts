import { describe, expect, it } from "vitest";
import {
  isTopChannelLive,
  liveTopChannelWhere,
  selectDisplayTopChannels,
} from "./game-top-channels";

const NOW = new Date("2026-10-08T14:40:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000);

function row(
  channelName: string,
  overrides: Partial<{
    platform: string;
    source: string;
    category: string;
    avgViewers: number;
    updatedAt: Date | string;
  }> = {},
) {
  return {
    channelName,
    platform: "twitch",
    source: "twitch_api",
    category: "most_watched",
    avgViewers: 100,
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

describe("isTopChannelLive", () => {
  it("keeps each writer's rows only while that writer would refresh them", () => {
    expect(
      isTopChannelLive(
        { source: "twitch_api", updatedAt: minutesAgo(70) },
        NOW,
      ),
    ).toBe(true);
    expect(
      isTopChannelLive(
        { source: "twitch_api", updatedAt: minutesAgo(80) },
        NOW,
      ),
    ).toBe(false);
    expect(
      isTopChannelLive({ source: "kick_api", updatedAt: minutesAgo(110) }, NOW),
    ).toBe(true);
    expect(
      isTopChannelLive(
        { source: "streamhatchet_live", updatedAt: minutesAgo(130) },
        NOW,
      ),
    ).toBe(false);
  });

  it("never shows a retired writer's rows, however recent", () => {
    expect(
      isTopChannelLive({ source: "api", updatedAt: minutesAgo(1) }, NOW),
    ).toBe(false);
    expect(isTopChannelLive({ source: null, updatedAt: NOW }, NOW)).toBe(false);
  });

  it("accepts the ISO strings a serialized page row carries", () => {
    expect(
      isTopChannelLive(
        { source: "kick_api", updatedAt: minutesAgo(30).toISOString() },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects rows without a timestamp or stamped in the future", () => {
    expect(isTopChannelLive({ source: "kick_api", updatedAt: null }, NOW)).toBe(
      false,
    );
    expect(
      isTopChannelLive({ source: "kick_api", updatedAt: minutesAgo(-10) }, NOW),
    ).toBe(false);
  });
});

describe("liveTopChannelWhere", () => {
  it("allows exactly the live sources, each with its own cutoff", () => {
    expect(liveTopChannelWhere(NOW)).toEqual({
      OR: [
        { source: "twitch_api", updatedAt: { gte: minutesAgo(75) } },
        { source: "kick_api", updatedAt: { gte: minutesAgo(120) } },
        { source: "streamhatchet_live", updatedAt: { gte: minutesAgo(120) } },
      ],
    });
  });
});

describe("selectDisplayTopChannels", () => {
  it("drops the May rows that topped League of Legends (QA 2026-10)", () => {
    const selected = selectDisplayTopChannels(
      [
        row("Jynxzi", {
          source: "api",
          avgViewers: 36_680,
          updatedAt: new Date("2026-05-18T20:01:57.095Z"),
        }),
        row("dinossindgeil", {
          source: "streamhatchet_live",
          avgViewers: 523,
          updatedAt: new Date("2026-10-05T13:46:00.000Z"),
        }),
        row("fps_shaka", { avgViewers: 18_923 }),
      ],
      NOW,
    );

    expect(selected.map((channel) => channel.channelName)).toEqual([
      "fps_shaka",
    ]);
  });

  it("keeps one row per channel and platform, preferring the platform's own API", () => {
    const selected = selectDisplayTopChannels(
      [
        row("AnthonyZ", {
          source: "streamhatchet_live",
          avgViewers: 4_461,
          updatedAt: minutesAgo(50),
        }),
        row("anthonyz", { avgViewers: 4_297 }),
        row("xQc", { platform: "kick", source: "kick_api", avgViewers: 9_953 }),
        row("xQc", { avgViewers: 26_273 }),
      ],
      NOW,
    );

    expect(
      selected.map((channel) => [
        channel.platform,
        channel.channelName,
        channel.source,
      ]),
    ).toEqual([
      ["twitch", "xQc", "twitch_api"],
      ["kick", "xQc", "kick_api"],
      ["twitch", "anthonyz", "twitch_api"],
    ]);
  });

  it("returns six most watched then five emerging, each by viewers now", () => {
    const mostWatched = Array.from({ length: 8 }, (_, index) =>
      row(`top${index}`, { avgViewers: 1_000 + index }),
    );
    const emerging = Array.from({ length: 7 }, (_, index) =>
      row(`new${index}`, { category: "emerging", avgViewers: 10 + index }),
    );

    const selected = selectDisplayTopChannels(
      [...emerging, ...mostWatched],
      NOW,
    );

    expect(selected.map((channel) => channel.channelName)).toEqual([
      "top7",
      "top6",
      "top5",
      "top4",
      "top3",
      "top2",
      "new6",
      "new5",
      "new4",
      "new3",
      "new2",
    ]);
  });
});
