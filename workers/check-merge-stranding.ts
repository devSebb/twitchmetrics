/**
 * Invariant check: no StreamHatchet history may point at a merged-away stub.
 *
 * A merge folds profile S into canonical C. When C already owns an account on
 * the same platform, S's PlatformAccount cannot move (the (creatorProfileId,
 * platform) unique) and legitimately stays on the stub — that is expected and
 * NOT what this checks. What must always move is the channel's history:
 * mergeProfiles calls moveShHistoryForAccount, so StreamSessionFact,
 * ChannelDailyRollup and ChannelGameDailyRollup rows always belong to the
 * canonical. Nothing reads through `mergedFrom`, so a row left on a stub is
 * invisible on the creator page.
 *
 * Read-only. Exits 1 when any history row is stranded, so the weekly workflow
 * fails loudly instead of silently drifting; the fix is
 *   npx tsx workers/repair-merge-stranding.ts --phase history --write
 *
 * Options:
 *   --limit-offenders N   how many offending stubs to print (default 20)
 *
 * Usage: npx tsx --env-file=apps/web/.env.local workers/check-merge-stranding.ts
 */
import { prisma } from "@twitchmetrics/database";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT_OFFENDERS =
  Number.parseInt(argValue("--limit-offenders") ?? "20", 10) || 20;

// Merged stubs are in the thousands; keep the id arrays well inside the
// parameter limits of a single statement.
const ID_CHUNK = 5_000;

function log(level: "info" | "error", msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [check-merge-stranding] ${msg}`;
  console[level](data === undefined ? line : `${line} ${JSON.stringify(data)}`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const stubs = await prisma.creatorProfile.findMany({
    where: { mergedIntoId: { not: null } },
    select: { id: true, slug: true, mergedIntoId: true },
  });
  const stubIds = stubs.map((s) => s.id);
  log("info", "Merged stubs", { stubs: stubIds.length });

  if (stubIds.length === 0) {
    log("info", "No merged profiles — nothing to check");
    return;
  }

  const counts = {
    streamSessionFact: 0,
    channelDailyRollup: 0,
    channelGameDailyRollup: 0,
  };
  // stubId -> rows stranded on it, across all three tables.
  const perStub = new Map<string, number>();

  for (const ids of chunk(stubIds, ID_CHUNK)) {
    const where = { creatorProfileId: { in: ids } };
    const [facts, rollups, gameRollups] = await Promise.all([
      prisma.streamSessionFact.groupBy({
        by: ["creatorProfileId"],
        where,
        _count: { _all: true },
      }),
      prisma.channelDailyRollup.groupBy({
        by: ["creatorProfileId"],
        where,
        _count: { _all: true },
      }),
      prisma.channelGameDailyRollup.groupBy({
        by: ["creatorProfileId"],
        where,
        _count: { _all: true },
      }),
    ]);

    for (const [table, rows] of [
      ["streamSessionFact", facts],
      ["channelDailyRollup", rollups],
      ["channelGameDailyRollup", gameRollups],
    ] as const) {
      for (const row of rows) {
        if (!row.creatorProfileId) continue;
        counts[table] += row._count._all;
        perStub.set(
          row.creatorProfileId,
          (perStub.get(row.creatorProfileId) ?? 0) + row._count._all,
        );
      }
    }
  }

  // Expected and not a failure: a same-platform account keeps living on the
  // stub. Reported so the two situations are never confused.
  const stubOwnedAccounts = await prisma.platformAccount.count({
    where: { creatorProfileId: { in: stubIds } },
  });

  const total =
    counts.streamSessionFact +
    counts.channelDailyRollup +
    counts.channelGameDailyRollup;

  log("info", "History rows on merged stubs", {
    ...counts,
    total,
    stubsAffected: perStub.size,
    stubOwnedAccounts_expected: stubOwnedAccounts,
  });

  if (total === 0) {
    log("info", "OK — no stranded history");
    return;
  }

  const bySlug = new Map(stubs.map((s) => [s.id, s]));
  const offenders = [...perStub.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT_OFFENDERS)
    .map(([stubId, rows]) => ({
      stubSlug: bySlug.get(stubId)?.slug ?? stubId,
      canonicalId: bySlug.get(stubId)?.mergedIntoId ?? null,
      rows,
    }));

  log("error", "Stranded history found — run the history repair", {
    total,
    fix: "npx tsx workers/repair-merge-stranding.ts --phase history --write",
    offenders,
  });
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
