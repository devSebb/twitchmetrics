import { describe, expect, it } from "vitest";
import { findStrangers, type ContactAccount } from "./contact-strangers";

/**
 * Contacts taken from Stream Hatchet's export of 2026-11-25, the ones behind
 * the wrong accounts the team found on Adobe Basics and "Twitch".
 */

function account(
  platform: string,
  username: string,
  reach: number,
  tracked = false,
): ContactAccount {
  return { platform, username, reach, tracked };
}

const handles = (accounts: ContactAccount[]) =>
  accounts.map((a) => `${a.platform}:${a.username}`);

describe("findStrangers", () => {
  it("drops @instagram and its sister accounts from Adobe Basics", () => {
    const result = findStrangers([
      account("youtube", "@adobebasics", 70_300, true),
      account("instagram", "instagram", 684_751_489),
      account("instagram", "creators", 23_583_059),
      account("x", "instagram", 31_643_230),
      account("youtube", "@instagram", 6_230_000),
      account("youtube", "@turbsyy", 22_900),
    ]);
    expect(result.reason).toBe("ratio");
    expect(handles(result.strangers)).toEqual([
      "instagram:instagram",
      "instagram:creators",
      "x:instagram",
      "youtube:@instagram",
      "youtube:@turbsyy",
    ]);
  });

  it("drops YouTube's accounts from a creator filed under YouTube's contact", () => {
    // 78M is only 56 times the creator's channel: the ratio rule misses it.
    const result = findStrangers([
      account("youtube", "@jessetc", 1_390_000, true),
      account("x", "jessetc_gaming", 17_365),
      account("x", "YouTube", 78_358_316),
      account("instagram", "youtube", 30_432_899),
      account("tiktok", "youtube", 4_700_000),
      account("youtube", "@youtube", 46_800_000),
    ]);
    expect(result.reason).toBe("second-identity");
    expect(handles(result.strangers)).toEqual([
      "x:YouTube",
      "instagram:youtube",
      "tiktok:youtube",
      "youtube:@youtube",
    ]);
  });

  it("keeps a creator's larger social accounts under the same name", () => {
    const result = findStrangers([
      account("twitch", "ibai", 19_000_000, true),
      account("instagram", "ibaillanos", 12_000_000),
      account("youtube", "@IbaiLlanos", 13_000_000),
    ]);
    expect(result.strangers).toEqual([]);
  });

  it("keeps one large account under another name", () => {
    // A personal Instagram, 30 times the channel, on a single platform.
    const result = findStrangers([
      account("twitch", "frostgg", 50_000, true),
      account("instagram", "maria.lopez", 1_500_000),
    ]);
    expect(result.strangers).toEqual([]);
  });

  it("does not count a link attached earlier as the creator's own", () => {
    const result = findStrangers([
      account("youtube", "@yngaming17", 23_600, true),
      account("youtube", "@time", 1_600_000, false),
      account("x", "TIME", 19_390_641),
    ]);
    expect(result.reason).toBe("ratio");
    expect(result.strangers).toHaveLength(2);
  });

  it("keeps accounts that match the contact's name when it is the creator's", () => {
    const members = [
      account("youtube", "@mavericks", 227_000, true),
      account("instagram", "dallasmavs", 4_669_239),
      account("x", "dallasmavs", 2_400_000),
    ];
    expect(findStrangers(members, "Dallas Mavericks").strangers).toEqual([]);
    expect(findStrangers(members, null).reason).toBe("second-identity");
  });

  it("takes a three-letter channel name inside a longer handle as a match", () => {
    const result = findStrangers([
      account("twitch", "zhc", 395, true),
      account("youtube", "@zhcyt", 31_300_000),
    ]);
    expect(result.strangers).toEqual([]);
  });

  it("does not judge accounts known only by a channel id", () => {
    const result = findStrangers([
      account("twitch", "TierZoo", 9_768, true),
      account("youtube", "UCHsRtomD4twRf5WVHHk-cMw", 3_700_000),
    ]);
    expect(result.strangers).toEqual([]);
  });

  it("judges nothing when we track no channel of the contact", () => {
    const result = findStrangers([
      account("instagram", "arianagrande", 370_000_000),
      account("x", "ArianaGrande", 80_000_000),
    ]);
    expect(result.strangers).toEqual([]);
  });
});
