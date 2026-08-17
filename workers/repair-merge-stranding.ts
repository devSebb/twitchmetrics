/**
 * Repair identity merges that stranded real channels on redirect stubs.
 *
 * Background: (creatorProfileId, platform) is unique, so when a merge folds a
 * profile into a canonical that already owns an account on the same platform,
 * that PlatformAccount cannot move and stays on the stub. Until 2026-08 its
 * StreamHatchet facts/rollups also stayed behind, and nothing reads through
 * `mergedFrom` — so the channel's whole history became invisible. Worse, the
 * canonical was picked by `totalFollowers` at a time when SH-born profiles
 * still carried 0, so a 51-follower VOD channel could win over a 5.9M main
 * channel and give the creator page the wrong name ("Kassan247" for
 * IShowSpeed).
 *
 * Two repair phases (both idempotent, dry-run by default):
 *
 *   swaps    — for every stranded tracked account A (on stub S → canonical C)
 *              whose follower evidence beats C's own account B on the same
 *              platform: swap A↔B between C and S, move each channel's SH
 *              history with it, and — when C's public identity was derived
 *              from B — rename C after A (displayName/avatar, and slug when it
 *              can be done cleanly, leaving a SlugRedirect behind).
 *   history  — for every remaining stub-owned tracked account, move its SH
 *              facts/rollups to the canonical (the fix now baked into
 *              mergeProfiles, applied retroactively).
 *
 * Options:
 *   --write                apply (default: dry-run report only)
 *   --phase swaps|history  run one phase (default: both, swaps first)
 *   --limit N              cap the number of swaps / accounts processed
 *   --slug <slug>          restrict to one canonical (by current slug)
 *
 * Usage: pnpm worker:repair-merge-stranding [-- --write]
 */
import { Prisma, prisma, type Platform } from "@twitchmetrics/database";
import { moveShHistoryForAccount } from "../apps/web/src/server/services/identity/merge";

/** Same rule as legacy-redirects.slugifyName (that module drags in `@/` imports). */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PHASE = argValue("--phase") ?? "both";
const LIMIT = Number.parseInt(argValue("--limit") ?? "0", 10) || 0;
const ONLY_SLUG = argValue("--slug") ?? null;

const TX_OPTIONS = { timeout: 180_000, maxWait: 15_000 };
const TRACKED_STREAM_PLATFORMS: Platform[] = ["twitch", "youtube", "kick"];

function log(level: "info" | "warn" | "error", msg: string, data?: unknown) {
  const line = `[${new Date().toISOString()}] [repair-merge-stranding] ${msg}`;
  const payload =
    data === undefined
      ? ""
      : " " +
        JSON.stringify(data, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        );
  (level === "error" ? console.error : console.log)(line + payload);
}

function isRetryableDbError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /closed the connection|Connection terminated|ECONNRESET|timed out|Timed out|Can't reach database|connection pool/i.test(
      msg,
    ) ||
    (err instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P1008", "P1017", "P2024", "P2034"].includes(err.code))
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      if (!isRetryableDbError(e) || attempt > maxRetries) throw e;
      const wait = Math.min(30_000, 1_000 * 2 ** attempt);
      log(
        "warn",
        `retryable DB error, retry ${attempt}/${maxRetries} in ${wait}ms`,
        {
          error: e instanceof Error ? e.message : String(e),
        },
      );
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function isClaimLocked(p: { state: string; userId: string | null }): boolean {
  return p.state === "claimed" || p.state === "premium" || p.userId !== null;
}

function evidence(a: {
  followerCount: bigint | null;
  subscriberCount: bigint | null;
}): bigint {
  return a.followerCount ?? a.subscriberCount ?? 0n;
}

/** Same rule as social-link-discovery.buildSearchText (kept local for the worker). */
function buildSearchText(
  displayName: string,
  slug: string,
  accounts: { platformUsername: string; platformDisplayName: string | null }[],
): string {
  const parts = [
    displayName,
    slug,
    ...accounts.map((a) => a.platformUsername).filter(Boolean),
    ...accounts.map((a) => a.platformDisplayName).filter((v) => v != null),
  ];
  return [...new Set(parts)].join(" ").toLowerCase();
}

/** Recompute totalFollowers/totalViews from tracked accounts (mirrors creator-aggregates). */
async function recomputeAggregates(
  tx: Prisma.TransactionClient,
  profileId: string,
) {
  const accounts = await tx.platformAccount.findMany({
    where: { creatorProfileId: profileId, discoverySource: null },
    select: { followerCount: true, totalViews: true, lastSyncedAt: true },
  });
  const totalFollowers = accounts.reduce(
    (s, a) => s + (a.followerCount ?? 0n),
    0n,
  );
  const totalViews = accounts.reduce((s, a) => s + (a.totalViews ?? 0n), 0n);
  const lastSnapshotAt = accounts.reduce<Date | null>(
    (latest, a) =>
      a.lastSyncedAt && (!latest || a.lastSyncedAt > latest)
        ? a.lastSyncedAt
        : latest,
    null,
  );
  await tx.creatorProfile.update({
    where: { id: profileId },
    data: { totalFollowers, totalViews, lastSnapshotAt },
  });
}

// ---------------------------------------------------------------------------
// Phase 1: swaps
// ---------------------------------------------------------------------------

type StrandedRow = {
  stub_id: string;
  stub_slug: string;
  stub_name: string;
  canonical_id: string;
  canonical_slug: string;
  canonical_name: string;
  canonical_state: string;
  canonical_user_id: string | null;
  canonical_avatar: string | null;
  platform: Platform;
  a_id: string;
  a_username: string;
  a_display: string | null;
  a_avatar: string | null;
  a_followers: bigint | null;
  a_subs: bigint | null;
  a_oauth: boolean;
  b_id: string;
  b_username: string;
  b_display: string | null;
  b_followers: bigint | null;
  b_subs: bigint | null;
  b_oauth: boolean;
};

async function loadInvertedMerges(): Promise<StrandedRow[]> {
  const slugFilter = ONLY_SLUG
    ? Prisma.sql`AND c.slug = ${ONLY_SLUG}`
    : Prisma.empty;
  return withRetry(
    () =>
      prisma.$queryRaw<StrandedRow[]>`
      SELECT s.id AS stub_id, s.slug AS stub_slug, s."displayName" AS stub_name,
             c.id AS canonical_id, c.slug AS canonical_slug, c."displayName" AS canonical_name,
             c.state AS canonical_state, c."userId" AS canonical_user_id, c."avatarUrl" AS canonical_avatar,
             a.platform,
             a.id AS a_id, a."platformUsername" AS a_username, a."platformDisplayName" AS a_display,
             a."platformAvatarUrl" AS a_avatar, a."followerCount" AS a_followers, a."subscriberCount" AS a_subs,
             a."isOAuthConnected" AS a_oauth,
             b.id AS b_id, b."platformUsername" AS b_username, b."platformDisplayName" AS b_display,
             b."followerCount" AS b_followers, b."subscriberCount" AS b_subs, b."isOAuthConnected" AS b_oauth
      FROM "CreatorProfile" s
      JOIN "CreatorProfile" c ON c.id = s."mergedIntoId"
      JOIN "PlatformAccount" a ON a."creatorProfileId" = s.id AND a."discoverySource" IS NULL
      JOIN "PlatformAccount" b ON b."creatorProfileId" = c.id AND b.platform = a.platform
      WHERE s."mergedIntoId" IS NOT NULL
        AND a.platform::text = ANY(${TRACKED_STREAM_PLATFORMS}::text[])
        AND COALESCE(a."followerCount", a."subscriberCount", 0) > COALESCE(b."followerCount", b."subscriberCount", 0)
        ${slugFilter}
      ORDER BY COALESCE(a."followerCount", a."subscriberCount", 0) DESC
    `,
  );
}

function identityDerivedFrom(
  profileName: string,
  account: { platformUsername: string; platformDisplayName: string | null },
): boolean {
  const n = profileName.trim().toLowerCase();
  return (
    n === account.platformUsername.trim().toLowerCase() ||
    (account.platformDisplayName != null &&
      n === account.platformDisplayName.trim().toLowerCase())
  );
}

async function slugIsFree(tx: Prisma.TransactionClient, slug: string) {
  const [p, r] = await Promise.all([
    tx.creatorProfile.findUnique({ where: { slug }, select: { id: true } }),
    tx.slugRedirect.findUnique({
      where: { oldSlug: slug },
      select: { oldSlug: true },
    }),
  ]);
  return !p && !r;
}

async function runSwaps() {
  const rows = await loadInvertedMerges();
  log("info", `inverted merges found: ${rows.length}`);
  let done = 0;
  let skipped = 0;

  for (const r of rows) {
    if (LIMIT && done >= LIMIT) break;
    const label = `${r.canonical_slug} [${r.platform}] ${r.b_username}(${evidence({ followerCount: r.b_followers, subscriberCount: r.b_subs })}) <- ${r.stub_slug}:${r.a_username}(${evidence({ followerCount: r.a_followers, subscriberCount: r.a_subs })})`;

    // Never touch a claimed creator's own connected accounts.
    if (
      isClaimLocked({
        state: r.canonical_state,
        userId: r.canonical_user_id,
      }) ||
      r.b_oauth
    ) {
      log("warn", `SKIP (claim-locked / OAuth on canonical): ${label}`);
      skipped++;
      continue;
    }

    const renameIdentity = identityDerivedFrom(r.canonical_name, {
      platformUsername: r.b_username,
      platformDisplayName: r.b_display,
    });
    const newDisplayName = r.a_display?.trim() || r.a_username;
    const slugFromB =
      r.canonical_slug === slugifyName(r.b_username) ||
      r.canonical_slug.startsWith(`${slugifyName(r.b_username)}-`);
    const candidateSlug = slugifyName(r.a_username);

    log("info", `${WRITE ? "SWAP" : "would swap"}: ${label}`, {
      renameIdentity,
      newDisplayName: renameIdentity ? newDisplayName : undefined,
      slugCandidate:
        renameIdentity && slugFromB && candidateSlug
          ? candidateSlug
          : undefined,
    });
    if (!WRITE) {
      done++;
      continue;
    }

    await withRetry(() =>
      prisma.$transaction(async (tx) => {
        // Re-validate under the transaction: nothing moved since the read.
        const [aNow, bNow] = await Promise.all([
          tx.platformAccount.findUnique({
            where: { id: r.a_id },
            select: {
              creatorProfileId: true,
              platform: true,
              platformUserId: true,
            },
          }),
          tx.platformAccount.findUnique({
            where: { id: r.b_id },
            select: {
              creatorProfileId: true,
              platform: true,
              platformUserId: true,
            },
          }),
        ]);
        if (
          !aNow ||
          !bNow ||
          aNow.creatorProfileId !== r.stub_id ||
          bNow.creatorProfileId !== r.canonical_id
        ) {
          throw new Error(`state changed for ${label}, aborting this swap`);
        }

        // (creatorProfileId, platform) is unique and not deferrable, so park A
        // on a throwaway profile for the duration of the swap.
        const parking = await tx.creatorProfile.create({
          data: {
            displayName: "__swap-parking",
            slug: `__swap-parking-${r.a_id}`,
            primaryPlatform: r.platform,
            listed: false,
          },
          select: { id: true },
        });
        await tx.platformAccount.update({
          where: { id: r.a_id },
          data: { creatorProfileId: parking.id },
        });
        await tx.platformAccount.update({
          where: { id: r.b_id },
          data: { creatorProfileId: r.stub_id },
        });
        await tx.platformAccount.update({
          where: { id: r.a_id },
          data: { creatorProfileId: r.canonical_id },
        });
        await tx.creatorProfile.delete({ where: { id: parking.id } });

        // History follows the account.
        const movedA = await moveShHistoryForAccount(tx, aNow, r.canonical_id);
        const movedB = await moveShHistoryForAccount(tx, bNow, r.stub_id);

        // Public identity: only rewrite when it demonstrably came from B.
        const profileData: Prisma.CreatorProfileUpdateInput = {};
        let newSlug: string | null = null;
        if (renameIdentity) {
          profileData.displayName = newDisplayName;
          profileData.avatarUrl = r.a_avatar ?? null;
          if (
            slugFromB &&
            candidateSlug &&
            candidateSlug !== r.canonical_slug
          ) {
            if (await slugIsFree(tx, candidateSlug)) {
              newSlug = candidateSlug;
              profileData.slug = candidateSlug;
              await tx.slugRedirect.create({
                data: {
                  oldSlug: r.canonical_slug,
                  creatorProfileId: r.canonical_id,
                },
              });
            }
          }
        }
        const accountsForSearch = await tx.platformAccount.findMany({
          where: { creatorProfileId: r.canonical_id },
          select: { platformUsername: true, platformDisplayName: true },
        });
        profileData.searchText = buildSearchText(
          (profileData.displayName as string | undefined) ?? r.canonical_name,
          newSlug ?? r.canonical_slug,
          accountsForSearch,
        );
        await tx.creatorProfile.update({
          where: { id: r.canonical_id },
          data: profileData,
        });

        await recomputeAggregates(tx, r.canonical_id);
        await recomputeAggregates(tx, r.stub_id);

        // Keep the merge's reversal bookkeeping coherent: B is now the
        // account that "did not move" (lives on the stub), A is canonical's.
        const links = await tx.identityLink.findMany({
          where: {
            canonicalProfileId: r.canonical_id,
            otherProfileId: r.stub_id,
            status: "merged",
          },
          select: { id: true, reversal: true },
        });
        for (const link of links) {
          const rev = (link.reversal ?? {}) as Record<string, unknown>;
          const notMoved = Array.isArray(rev.notMovedAccountIds)
            ? (rev.notMovedAccountIds as string[]).map((id) =>
                id === r.a_id ? r.b_id : id,
              )
            : [r.b_id];
          const swaps = Array.isArray(rev.swappedAccounts)
            ? (rev.swappedAccounts as unknown[])
            : [];
          swaps.push({
            toCanonical: r.a_id,
            toStub: r.b_id,
            at: new Date().toISOString(),
            by: "repair-merge-stranding",
          });
          await tx.identityLink.update({
            where: { id: link.id },
            data: {
              reversal: {
                ...rev,
                notMovedAccountIds: notMoved,
                swappedAccounts: swaps,
              } as Prisma.InputJsonValue,
            },
          });
        }

        log("info", `swapped: ${label}`, {
          movedA,
          movedB,
          renamed: renameIdentity ? newDisplayName : null,
          newSlug,
        });
      }, TX_OPTIONS),
    );
    done++;
  }
  log(
    "info",
    `swaps ${WRITE ? "applied" : "planned"}: ${done}, skipped: ${skipped}`,
  );
}

// ---------------------------------------------------------------------------
// Phase 2: history
// ---------------------------------------------------------------------------

async function runHistory() {
  const slugFilter = ONLY_SLUG
    ? Prisma.sql`AND c.slug = ${ONLY_SLUG}`
    : Prisma.empty;
  const accounts = await withRetry(
    () =>
      prisma.$queryRaw<
        {
          account_id: string;
          platform: Platform;
          platform_user_id: string;
          username: string;
          stub_slug: string;
          canonical_id: string;
          canonical_slug: string;
        }[]
      >`
      SELECT a.id AS account_id, a.platform, a."platformUserId" AS platform_user_id, a."platformUsername" AS username,
             s.slug AS stub_slug, c.id AS canonical_id, c.slug AS canonical_slug
      FROM "PlatformAccount" a
      JOIN "CreatorProfile" s ON s.id = a."creatorProfileId" AND s."mergedIntoId" IS NOT NULL
      JOIN "CreatorProfile" c ON c.id = s."mergedIntoId"
      WHERE a."discoverySource" IS NULL
        AND a.platform::text = ANY(${TRACKED_STREAM_PLATFORMS}::text[])
        ${slugFilter}
      ORDER BY a."followerCount" DESC NULLS LAST
    `,
  );
  log("info", `stub-owned tracked accounts: ${accounts.length}`);

  let processed = 0;
  let sessions = 0;
  let rollups = 0;
  let gameRollups = 0;
  for (const a of accounts) {
    if (LIMIT && processed >= LIMIT) break;
    const account = {
      platform: a.platform,
      platformUserId: a.platform_user_id,
    };
    if (!WRITE) {
      // Cheap dry-run measure: rows still owned by the stub for this channel.
      const shPlatform =
        a.platform === "youtube" ? ["yt", "ytg"] : [a.platform];
      const pending = await withRetry(() =>
        prisma.channelDailyRollup.count({
          where: {
            source: "streamhatchet",
            platform: { in: shPlatform },
            platformUserId: a.platform_user_id,
            creatorProfileId: { not: a.canonical_id },
          },
        }),
      );
      if (pending > 0) {
        log(
          "info",
          `would move history: ${a.stub_slug}:${a.username} -> ${a.canonical_slug}`,
          { rollupDaysPending: pending },
        );
      }
      rollups += pending;
      processed++;
      continue;
    }
    const moved = await withRetry(() =>
      prisma.$transaction(
        (tx) => moveShHistoryForAccount(tx, account, a.canonical_id),
        TX_OPTIONS,
      ),
    );
    if (moved.sessions || moved.rollups || moved.gameRollups) {
      log(
        "info",
        `moved history: ${a.stub_slug}:${a.username} -> ${a.canonical_slug}`,
        moved,
      );
    }
    sessions += moved.sessions;
    rollups += moved.rollups;
    gameRollups += moved.gameRollups;
    processed++;
    if (processed % 100 === 0)
      log("info", `progress ${processed}/${accounts.length}`, {
        sessions,
        rollups,
        gameRollups,
      });
  }
  log(
    "info",
    `history ${WRITE ? "moved" : "pending"}: accounts=${processed}`,
    WRITE ? { sessions, rollups, gameRollups } : { rollupDaysPending: rollups },
  );
}

async function main() {
  log(
    "info",
    `start mode=${WRITE ? "WRITE" : "dry-run"} phase=${PHASE}${LIMIT ? ` limit=${LIMIT}` : ""}${ONLY_SLUG ? ` slug=${ONLY_SLUG}` : ""}`,
  );
  if (PHASE === "swaps" || PHASE === "both") await runSwaps();
  if (PHASE === "history" || PHASE === "both") await runHistory();
  log("info", "done");
}

main()
  .catch((e) => {
    log("error", "fatal", {
      error: e instanceof Error ? (e.stack ?? e.message) : String(e),
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
