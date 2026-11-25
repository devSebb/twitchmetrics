import { describe, expect, it } from "vitest";
import { planSweepBatch, type SweepAccount } from "./subscriber-sweep";

const account = (id: string, followerCount: bigint | null): SweepAccount => ({
  id,
  creatorProfileId: `creator-${id}`,
  platformUserId: `UC${id}`,
  followerCount,
});

describe("planSweepBatch", () => {
  it("sorts a batch into changed, unchanged, hidden and not found", () => {
    const stale = account("a", 656_000n); // Maher Roblox, QA 2026-11-24
    const same = account("b", 14_400n);
    const hidden = account("c", 500n);
    const gone = account("d", 900n);
    const neverCounted = account("e", null);

    const plan = planSweepBatch(
      [stale, same, hidden, gone, neverCounted],
      new Map([
        ["UCa", { subscriberCount: 954_000n, hidden: false }],
        ["UCb", { subscriberCount: 14_400n, hidden: false }],
        ["UCc", { subscriberCount: null, hidden: true }],
        ["UCe", { subscriberCount: 12n, hidden: false }],
      ]),
    );

    expect(plan.changed).toEqual([
      { account: stale, count: 954_000n },
      { account: neverCounted, count: 12n },
    ]);
    expect(plan.unchanged).toEqual([same]);
    expect(plan.hidden).toEqual([hidden]);
    expect(plan.notFound).toEqual([gone]);
  });

  it("treats a missing count as hidden, not as zero", () => {
    const plan = planSweepBatch(
      [account("a", 100n)],
      new Map([["UCa", { subscriberCount: null, hidden: false }]]),
    );
    expect(plan.changed).toEqual([]);
    expect(plan.hidden).toHaveLength(1);
  });
});
