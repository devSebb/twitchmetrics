/**
 * A platform's follower count as Stream Hatchet BI shows it: the channel we
 * hold plus the creator's other channels on that platform (BI shows xQc's
 * five YouTube channels as one 3.29M figure). Returns null when nothing is
 * known, so callers keep their own "no count" handling.
 */
export function platformFollowerCount(account: {
  followerCount: bigint | number | null;
  otherChannelsFollowerCount?: bigint | number | null;
}): bigint | null {
  const own = account.followerCount;
  const other = account.otherChannelsFollowerCount ?? null;
  if (own == null && other == null) return null;
  return BigInt(own ?? 0) + BigInt(other ?? 0);
}

/**
 * The same figure for an account serialized for the client, where BigInt
 * columns arrive as decimal strings (serializeBigInt). Non-numeric strings
 * count as unknown.
 */
export function serializedPlatformFollowerCount(account: {
  followerCount: string | null;
  otherChannelsFollowerCount?: string | null;
}): bigint | null {
  return platformFollowerCount({
    followerCount: parseCount(account.followerCount),
    otherChannelsFollowerCount: parseCount(account.otherChannelsFollowerCount),
  });
}

function parseCount(value: string | null | undefined): bigint | null {
  if (value == null || !/^-?\d+$/.test(value)) return null;
  return BigInt(value);
}
