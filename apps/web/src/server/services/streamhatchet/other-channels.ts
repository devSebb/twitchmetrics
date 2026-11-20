/**
 * Which of our profiles gets the followers of a Stream Hatchet creator's
 * other channels (PlatformAccount.otherChannelsFollowerCount).
 *
 * Stream Hatchet BI shows a creator's followers on a platform as the sum of
 * every channel its contact links there (Asmongold = zackrawrr +
 * asmongold247). We add the channels we don't show to the account we do.
 *
 * A contact usually maps to one of our profiles, which then gets all of it.
 * When it maps to several (a duplicate profile that was never merged, or a
 * channel Stream Hatchet files under the wrong creator), each platform's
 * extra followers go to the profile holding the contact's biggest channel
 * there that we hold. Until 2026-11 such contacts were skipped entirely:
 * 23,538 of them, so TheBurntPeanut (blocked by a 20-follower Kick
 * duplicate) and HasanAbi showed only their main channel.
 */

export type ContactChannel = {
  platform: string;
  userId: string;
  reach: number | null;
  /** Our profile holding this channel, when we hold it. */
  creatorProfileId: string | null;
};

/** A contact's channels on one platform: user id -> followers. */
export type PlatformChannels = Map<string, number>;

type Assignment = {
  channels: PlatformChannels;
  /** The profile holds one of these channels for certain. */
  held: boolean;
  total: number;
};

/** profile id -> platform -> the contact's channels on that platform. */
export type OtherChannelAssignments = Map<string, Map<string, Assignment>>;

function cleanReach(reach: number | null): number {
  return reach != null && Number.isFinite(reach)
    ? Math.max(0, Math.trunc(reach))
    : 0;
}

/**
 * Adds one contact's channels to the assignments. Every profile of the
 * contact gets an entry, empty when it owns no platform, so a value written
 * before can be cleared.
 */
export function assignContactChannels(
  assignments: OtherChannelAssignments,
  members: readonly ContactChannel[],
): void {
  const byPlatform = new Map<string, PlatformChannels>();
  // platform -> user id -> our profile
  const holders = new Map<string, Map<string, string>>();
  const profileIds = new Set<string>();
  for (const member of members) {
    if (!member.userId) continue;
    const channels: PlatformChannels =
      byPlatform.get(member.platform) ?? new Map<string, number>();
    channels.set(
      member.userId,
      Math.max(channels.get(member.userId) ?? 0, cleanReach(member.reach)),
    );
    byPlatform.set(member.platform, channels);
    if (member.creatorProfileId) {
      profileIds.add(member.creatorProfileId);
      const held = holders.get(member.platform) ?? new Map<string, string>();
      held.set(member.userId, member.creatorProfileId);
      holders.set(member.platform, held);
    }
  }
  if (profileIds.size === 0) return;
  for (const profileId of profileIds) {
    if (!assignments.has(profileId)) assignments.set(profileId, new Map());
  }

  const onlyProfile = profileIds.size === 1 ? [...profileIds][0]! : null;
  for (const [platform, channels] of byPlatform) {
    const held = holders.get(platform);
    let owner = onlyProfile;
    if (!owner) {
      // Several profiles: the one holding the biggest channel we hold. A
      // platform none of them holds a channel on stays unassigned.
      if (!held) continue;
      let top: { userId: string; reach: number } | null = null;
      for (const userId of held.keys()) {
        const reach = channels.get(userId) ?? 0;
        if (
          !top ||
          reach > top.reach ||
          (reach === top.reach && userId < top.userId)
        ) {
          top = { userId, reach };
        }
      }
      owner = held.get(top!.userId)!;
    }

    let total = 0;
    for (const reach of channels.values()) total += reach;
    const next: Assignment = {
      channels,
      held: held ? [...held.values()].includes(owner) : false,
      total,
    };
    // A profile can sit under two contacts. Keep the one that describes a
    // channel it holds, then the bigger one.
    const forProfile = assignments.get(owner)!;
    const current = forProfile.get(platform);
    if (
      !current ||
      (next.held && !current.held) ||
      (next.held === current.held && next.total > current.total)
    ) {
      forProfile.set(platform, next);
    }
  }
}

/**
 * Followers of the creator's other channels on an account's platform. Null
 * when there is no other channel, or when the account's own channel is not
 * among the contact's (then the two may not describe the same creator).
 */
export function otherChannelsFollowers(
  assignments: OtherChannelAssignments,
  creatorProfileId: string,
  platform: string,
  platformUserId: string,
): bigint | null {
  const channels = assignments.get(creatorProfileId)?.get(platform)?.channels;
  if (!channels || !channels.has(platformUserId)) return null;
  let other = 0;
  for (const [userId, reach] of channels) {
    if (userId !== platformUserId) other += reach;
  }
  return other > 0 ? BigInt(other) : null;
}
