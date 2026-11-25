/**
 * Sorting one batch of a subscriber sweep: what the platform API said about
 * each account against what we have stored. Pure, so the rule is testable
 * without the API or a database (workers/youtube-subscriber-sweep.ts).
 */

export type SweepAccount = {
  id: string;
  creatorProfileId: string;
  platformUserId: string;
  followerCount: bigint | null;
};

/** One channel as the API returned it. Absent from the map = not returned. */
export type SweepObservation = {
  subscriberCount: bigint | null;
  /** The channel hides its count: nothing to compare, nothing to write. */
  hidden: boolean;
};

export type SweepPlan = {
  /** Count differs from the stored one: update it and record a reading. */
  changed: { account: SweepAccount; count: bigint }[];
  /** Same count: only the "checked on" date moves. */
  unchanged: SweepAccount[];
  hidden: SweepAccount[];
  /** The API did not return the channel (deleted or terminated). */
  notFound: SweepAccount[];
};

export function planSweepBatch(
  accounts: readonly SweepAccount[],
  observed: ReadonlyMap<string, SweepObservation>,
): SweepPlan {
  const plan: SweepPlan = {
    changed: [],
    unchanged: [],
    hidden: [],
    notFound: [],
  };
  for (const account of accounts) {
    const seen = observed.get(account.platformUserId);
    if (!seen) {
      plan.notFound.push(account);
    } else if (seen.hidden || seen.subscriberCount === null) {
      plan.hidden.push(account);
    } else if (seen.subscriberCount === account.followerCount) {
      plan.unchanged.push(account);
    } else {
      plan.changed.push({ account, count: seen.subscriberCount });
    }
  }
  return plan;
}
