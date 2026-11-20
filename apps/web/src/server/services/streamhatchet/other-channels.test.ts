import { describe, expect, it } from "vitest";
import {
  assignContactChannels,
  otherChannelsFollowers,
  type ContactChannel,
  type OtherChannelAssignments,
} from "./other-channels";

/**
 * Stream Hatchet BI counts every channel of a creator. These rules decide
 * which of our profiles gets the channels we don't show (QA round 3,
 * 2026-11: TheBurntPeanut and HasanAbi were missing theirs).
 */

function channel(
  platform: string,
  userId: string,
  reach: number | null,
  creatorProfileId: string | null = null,
): ContactChannel {
  return { platform, userId, reach, creatorProfileId };
}

function assign(...contacts: ContactChannel[][]): OtherChannelAssignments {
  const assignments: OtherChannelAssignments = new Map();
  for (const members of contacts) assignContactChannels(assignments, members);
  return assignments;
}

describe("a contact that maps to one profile", () => {
  const assignments = assign([
    channel("twitch", "main", 3_000_000, "peanut"),
    channel("twitch", "alt-1", 150_000),
    channel("twitch", "alt-2", 50_000),
    channel("instagram", "ig-main", 400_000),
    channel("instagram", "ig-alt", 10_000),
  ]);

  it("adds every other channel on the platform", () => {
    expect(
      otherChannelsFollowers(assignments, "peanut", "twitch", "main"),
    ).toBe(200_000n);
  });

  it("covers platforms we only hold a link on", () => {
    expect(
      otherChannelsFollowers(assignments, "peanut", "instagram", "ig-main"),
    ).toBe(10_000n);
  });

  it("adds nothing when our account is not one of the contact's channels", () => {
    expect(
      otherChannelsFollowers(assignments, "peanut", "twitch", "someone-else"),
    ).toBeNull();
  });

  it("adds nothing when there is no other channel", () => {
    const single = assign([channel("twitch", "main", 500, "solo")]);
    expect(otherChannelsFollowers(single, "solo", "twitch", "main")).toBeNull();
  });
});

describe("a contact that maps to several profiles", () => {
  // TheBurntPeanut: the main profile plus a 20-follower Kick duplicate.
  const assignments = assign([
    channel("twitch", "main", 3_000_000, "peanut"),
    channel("twitch", "alt-1", 150_000),
    channel("twitch", "alt-2", 50_000),
    channel("kick", "kick-dup", 20, "peanut-duplicate"),
    channel("instagram", "ig-main", 400_000),
    channel("instagram", "ig-alt", 10_000),
  ]);

  it("still adds the other channels to the profile holding the main one", () => {
    expect(
      otherChannelsFollowers(assignments, "peanut", "twitch", "main"),
    ).toBe(200_000n);
  });

  it("adds nothing to the duplicate", () => {
    expect(
      otherChannelsFollowers(
        assignments,
        "peanut-duplicate",
        "kick",
        "kick-dup",
      ),
    ).toBeNull();
    expect(assignments.get("peanut-duplicate")?.size).toBe(1);
  });

  it("leaves a platform none of the profiles holds a channel on", () => {
    expect(
      otherChannelsFollowers(assignments, "peanut", "instagram", "ig-main"),
    ).toBeNull();
  });

  it("gives a platform two profiles share to the one with the bigger channel", () => {
    const shared = assign([
      channel("twitch", "big", 2_500_000, "main-profile"),
      channel("twitch", "small", 250_000, "second-profile"),
      channel("twitch", "unheld", 1_000),
    ]);
    expect(
      otherChannelsFollowers(shared, "main-profile", "twitch", "big"),
    ).toBe(251_000n);
    expect(
      otherChannelsFollowers(shared, "second-profile", "twitch", "small"),
    ).toBeNull();
    // Listed with nothing assigned, so an older value gets cleared.
    expect(shared.get("second-profile")?.size).toBe(0);
  });

  it("breaks a tie the same way on every run", () => {
    const members = [
      channel("twitch", "b", 100, "profile-b"),
      channel("twitch", "a", 100, "profile-a"),
    ];
    const forward = assign(members);
    const backward = assign([...members].reverse());
    expect(otherChannelsFollowers(forward, "profile-a", "twitch", "a")).toBe(
      100n,
    );
    expect(otherChannelsFollowers(backward, "profile-a", "twitch", "a")).toBe(
      100n,
    );
    expect(
      otherChannelsFollowers(forward, "profile-b", "twitch", "b"),
    ).toBeNull();
  });
});

describe("a profile that sits under two contacts", () => {
  it("keeps each platform from the contact that holds its channel", () => {
    const twitchContact = [
      channel("twitch", "tw", 1_000, "creator"),
      channel("twitch", "tw-alt", 300),
    ];
    const youtubeContact = [
      channel("youtube", "yt", 5_000, "creator"),
      channel("youtube", "yt-alt", 700),
      // A Twitch channel of this contact that is not ours.
      channel("twitch", "stranger", 9_000_000),
    ];
    for (const assignments of [
      assign(twitchContact, youtubeContact),
      assign(youtubeContact, twitchContact),
    ]) {
      expect(
        otherChannelsFollowers(assignments, "creator", "twitch", "tw"),
      ).toBe(300n);
      expect(
        otherChannelsFollowers(assignments, "creator", "youtube", "yt"),
      ).toBe(700n);
    }
  });
});

describe("reach values", () => {
  it("treats missing or broken reach as zero and keeps the larger duplicate", () => {
    const assignments = assign([
      channel("twitch", "main", 1_000, "creator"),
      channel("twitch", "alt", null),
      channel("twitch", "alt", 250.9),
      channel("twitch", "nan", Number.NaN),
      channel("twitch", "negative", -5),
    ]);
    expect(
      otherChannelsFollowers(assignments, "creator", "twitch", "main"),
    ).toBe(250n);
  });
});
