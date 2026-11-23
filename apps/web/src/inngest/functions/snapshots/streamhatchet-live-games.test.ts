import { describe, expect, it } from "vitest";
import {
  liveGamePlatformRows,
  slimLiveGame,
} from "./streamhatchet-game-snapshot";

/**
 * The first /live/games call that wasn't a 429 (2026-11-04 01:25) returned 25
 * games and wrote nothing: the parser read `platform_data`, the response says
 * `platforms`. This is that response's Just Chatting row, as recorded in the
 * run's metadata sample.
 */
const JUST_CHATTING = {
  game: "Just Chatting",
  platforms: [
    {
      channels: 2452,
      developers: "",
      genres: "Non Gaming",
      platform: "kick",
      platforms: "",
      publishers: "",
      ratio: 164.71,
      viewers: 403877,
    },
    {
      channels: 5563,
      developers: "",
      genres: "Non Gaming",
      platform: "twitch",
      platforms: "",
      publishers: "",
      ratio: 98.86,
      viewers: 549944,
    },
  ],
  total_channels: 8015,
  total_ratio: 119,
  total_viewers: 953821,
  twitch_game: "Just Chatting",
};

describe("liveGamePlatformRows", () => {
  it("reads the per-platform list /live/games sends", () => {
    expect(liveGamePlatformRows(JUST_CHATTING)).toEqual([
      { platform: "kick", viewers: 403877, channels: 2452 },
      { platform: "twitch", viewers: 549944, channels: 5563 },
    ]);
  });

  it("maps Stream Hatchet's ytg to youtube and drops unknown platforms", () => {
    expect(
      liveGamePlatformRows({
        game: "Minecraft",
        platforms: [
          { platform: "ytg", viewers: 1200.4, channels: 30 },
          { platform: "facebook", viewers: 50, channels: 2 },
        ],
      }),
    ).toEqual([{ platform: "youtube", viewers: 1200, channels: 30 }]);
  });
});

describe("slimLiveGame", () => {
  it("keeps the name and the counts, and nothing else", () => {
    const slim = slimLiveGame({ ...JUST_CHATTING, game_id: 509658 });
    expect(liveGamePlatformRows(slim)).toEqual(
      liveGamePlatformRows(JUST_CHATTING),
    );
    expect(slim.game).toBe("Just Chatting");
    expect(slim.game_id).toBe(509658);
    expect(JSON.stringify(slim)).not.toContain("genres");
  });

  it("leaves a row without a per-platform list as it is", () => {
    const flat = { game: "Chess", platform: "twitch", viewers: 900 };
    expect(slimLiveGame(flat)).toBe(flat);
  });
});
