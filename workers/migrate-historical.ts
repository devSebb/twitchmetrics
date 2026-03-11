/**
 * Legacy TwitchMetrics Database Migration Script
 *
 * Migrates historical data from the legacy TwitchMetrics database into the
 * new schema. Handles both creator profiles and historical snapshots.
 *
 * Usage:
 *   tsx workers/migrate-historical.ts                     # Full migration
 *   tsx workers/migrate-historical.ts --limit 1000        # Test with 1K records
 *   tsx workers/migrate-historical.ts --dry-run            # Count without writing
 *   tsx workers/migrate-historical.ts --skip-snapshots     # Channels only
 *   tsx workers/migrate-historical.ts --inspect            # Inspect legacy schema only
 *
 * Requires:
 *   LEGACY_DATABASE_URL — connection string for the legacy database
 *   DATABASE_URL — connection string for the new database
 */

import { PrismaClient, Platform, type Prisma } from "@prisma/client";
import pg from "pg";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const INSPECT_ONLY = args.includes("--inspect");
const SKIP_SNAPSHOTS = args.includes("--skip-snapshots");
const LIMIT = (() => {
  const idx = args.indexOf("--limit");
  return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 0;
})();

const BATCH_SIZE = 1000;
const SNAPSHOT_BATCH_SIZE = 500;
const LOG_INTERVAL = 10_000;

const prisma = new PrismaClient();

// ============================================================
// SLUG GENERATION
// ============================================================

function generateSlug(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const slugCache = new Set<string>();

async function ensureUniqueSlug(baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let suffix = 2;

  while (slugCache.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  // Double-check against DB for existing records
  while (await prisma.creatorProfile.findUnique({ where: { slug } })) {
    slugCache.add(slug);
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  slugCache.add(slug);
  return slug;
}

// ============================================================
// LEGACY DB CONNECTION
// ============================================================

function getLegacyConnection(): pg.Pool {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) {
    console.error(
      "ERROR: LEGACY_DATABASE_URL is not set. Set it in .env.local or as an environment variable.",
    );
    process.exit(1);
  }

  return new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
  });
}

// ============================================================
// STEP 0: INSPECT LEGACY SCHEMA
// ============================================================

async function inspectLegacySchema(pool: pg.Pool): Promise<void> {
  console.log("\n=== LEGACY DATABASE SCHEMA INSPECTION ===\n");

  // List all tables
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );

  console.log("Tables found:");
  for (const row of tables.rows) {
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM "${row.table_name}"`,
    );
    console.log(`  - ${row.table_name} (${countResult.rows[0].count} rows)`);

    // Show columns
    const columns = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [row.table_name],
    );

    for (const col of columns.rows) {
      console.log(
        `      ${col.column_name} (${col.data_type}, ${col.is_nullable === "YES" ? "nullable" : "required"})`,
      );
    }
  }

  // Show sample data from likely channel/streamer tables
  const channelTables = tables.rows.filter(
    (t) =>
      t.table_name.includes("channel") ||
      t.table_name.includes("streamer") ||
      t.table_name.includes("user") ||
      t.table_name.includes("creator"),
  );

  for (const t of channelTables) {
    console.log(`\nSample data from "${t.table_name}" (first 3 rows):`);
    const sample = await pool.query(`SELECT * FROM "${t.table_name}" LIMIT 3`);
    console.log(JSON.stringify(sample.rows, null, 2));
  }

  // Show sample from snapshot/stats tables
  const snapshotTables = tables.rows.filter(
    (t) =>
      t.table_name.includes("snapshot") ||
      t.table_name.includes("stat") ||
      t.table_name.includes("metric") ||
      t.table_name.includes("history"),
  );

  for (const t of snapshotTables) {
    console.log(`\nSample data from "${t.table_name}" (first 3 rows):`);
    const sample = await pool.query(
      `SELECT * FROM "${t.table_name}" ORDER BY 1 LIMIT 3`,
    );
    console.log(JSON.stringify(sample.rows, null, 2));

    // Show date range
    const dateColumns = (
      await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       AND data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date')`,
        [t.table_name],
      )
    ).rows;

    for (const dc of dateColumns) {
      const range = await pool.query(
        `SELECT MIN("${dc.column_name}") as min_date, MAX("${dc.column_name}") as max_date
         FROM "${t.table_name}"`,
      );
      console.log(
        `  Date range for ${dc.column_name}: ${range.rows[0].min_date} → ${range.rows[0].max_date}`,
      );
    }
  }
}

// ============================================================
// STEP 1: MIGRATE CHANNELS → CREATOR PROFILES
// ============================================================

/**
 * IMPORTANT: This function assumes a common legacy schema. You MUST run
 * --inspect first and adjust the column names below to match your actual
 * legacy database structure.
 *
 * Expected legacy columns (adjust as needed):
 *   - id or twitch_id: Twitch broadcaster ID
 *   - login or username: Twitch login name
 *   - display_name: Display name
 *   - profile_image_url: Avatar URL (optional)
 *   - description or bio: Channel description (optional)
 *   - view_count or views: Total view count (optional)
 *   - follower_count or followers: Follower count (optional)
 */
async function migrateChannels(pool: pg.Pool): Promise<Map<string, string>> {
  console.log("\n=== STEP 1: MIGRATING CHANNELS ===\n");

  // Map of legacy twitch_id → new creatorProfileId
  const idMap = new Map<string, string>();

  // -------------------------------------------------------
  // ADJUST THIS QUERY to match your legacy schema!
  // Run with --inspect first to see the actual table/column names.
  // -------------------------------------------------------
  const countQuery = `SELECT COUNT(*) as count FROM channels`;
  const selectQuery = `
    SELECT
      twitch_id,
      login,
      display_name,
      profile_image_url,
      description,
      view_count,
      follower_count
    FROM channels
    ORDER BY twitch_id
  `;

  const countResult = await pool.query<{ count: string }>(countQuery);
  const totalRecords = parseInt(countResult.rows[0].count, 10);
  const recordsToProcess =
    LIMIT > 0 ? Math.min(LIMIT, totalRecords) : totalRecords;

  console.log(
    `Found ${totalRecords} channels in legacy DB. Processing ${recordsToProcess}.`,
  );

  if (DRY_RUN) {
    console.log("DRY RUN — skipping writes.");
    return idMap;
  }

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;

  // Use a cursor for memory-efficient iteration
  const limitClause = LIMIT > 0 ? ` LIMIT ${LIMIT}` : "";
  const rows = await pool.query(selectQuery + limitClause);

  for (let i = 0; i < rows.rows.length; i += BATCH_SIZE) {
    const batch = rows.rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const twitchId = String(row.twitch_id);
        const username = String(
          row.login || row.display_name || twitchId,
        ).toLowerCase();
        const displayName = String(row.display_name || row.login || twitchId);

        // Check if this Twitch account already exists
        const existing = await prisma.platformAccount.findUnique({
          where: {
            platform_platformUserId: {
              platform: "twitch",
              platformUserId: twitchId,
            },
          },
        });

        if (existing) {
          idMap.set(twitchId, existing.creatorProfileId);
          skipped++;
          processed++;
          continue;
        }

        const slug = await ensureUniqueSlug(generateSlug(username));
        const followerCount = BigInt(row.follower_count ?? row.followers ?? 0);
        const viewCount = BigInt(row.view_count ?? row.views ?? 0);

        const profile = await prisma.creatorProfile.create({
          data: {
            displayName,
            slug,
            avatarUrl: row.profile_image_url ?? null,
            bio: row.description ?? null,
            primaryPlatform: "twitch",
            state: "unclaimed",
            snapshotTier:
              followerCount >= 100_000n
                ? "tier1"
                : followerCount >= 10_000n
                  ? "tier2"
                  : "tier3",
            totalFollowers: followerCount,
            totalViews: viewCount,
            searchText: `${displayName} ${username}`.toLowerCase(),
            platformAccounts: {
              create: {
                platform: "twitch",
                platformUserId: twitchId,
                platformUsername: username,
                platformDisplayName: displayName,
                platformUrl: `https://twitch.tv/${username}`,
                platformAvatarUrl: row.profile_image_url ?? null,
                followerCount,
                totalViews: viewCount,
              },
            },
          },
        });

        idMap.set(twitchId, profile.id);
        created++;
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(
            `  Error migrating channel ${row.twitch_id}:`,
            (err as Error).message,
          );
        }
      }

      processed++;
      if (processed % LOG_INTERVAL === 0) {
        console.log(
          `  Progress: ${processed}/${recordsToProcess} (created: ${created}, skipped: ${skipped}, errors: ${errors})`,
        );
      }
    }
  }

  console.log(
    `\nChannel migration complete: ${created} created, ${skipped} skipped (already exist), ${errors} errors`,
  );

  return idMap;
}

// ============================================================
// STEP 2: MIGRATE HISTORICAL SNAPSHOTS
// ============================================================

/**
 * Migrates historical snapshot data preserving ORIGINAL timestamps.
 *
 * ADJUST the query below to match your legacy snapshot table.
 * Expected columns:
 *   - channel_id or twitch_id: FK to channel
 *   - recorded_at or created_at or timestamp: Snapshot timestamp
 *   - followers or follower_count: Follower count at time of snapshot
 *   - views or view_count: Total view count at time of snapshot (optional)
 *   - viewer_count: Live viewer count at time of snapshot (optional)
 */
async function migrateSnapshots(
  pool: pg.Pool,
  idMap: Map<string, string>,
): Promise<void> {
  console.log("\n=== STEP 2: MIGRATING HISTORICAL SNAPSHOTS ===\n");

  if (DRY_RUN) {
    console.log("DRY RUN — counting snapshot records only.");
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM snapshots`,
    );
    console.log(`Found ${countResult.rows[0].count} snapshots in legacy DB.`);
    return;
  }

  // -------------------------------------------------------
  // ADJUST THIS QUERY to match your legacy schema!
  // -------------------------------------------------------
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM snapshots`,
  );
  const totalSnapshots = parseInt(countResult.rows[0].count, 10);
  console.log(`Found ${totalSnapshots} snapshots to migrate.`);

  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;
  let futureTimestamps = 0;

  const now = new Date();

  // Process per creator to keep batches manageable
  const twitchIds = Array.from(idMap.keys());

  for (const twitchId of twitchIds) {
    const creatorProfileId = idMap.get(twitchId)!;

    const limitClause =
      LIMIT > 0 ? ` LIMIT ${Math.floor(LIMIT / twitchIds.length) || 100}` : "";
    const snapshotRows = await pool.query(
      `SELECT recorded_at, follower_count, view_count, viewer_count
       FROM snapshots
       WHERE channel_id = $1
       ORDER BY recorded_at ASC${limitClause}`,
      [twitchId],
    );

    if (snapshotRows.rows.length === 0) continue;

    const snapshotBatch: Prisma.MetricSnapshotCreateManyInput[] = [];

    for (const snap of snapshotRows.rows) {
      const recordedAt = new Date(
        snap.recorded_at ?? snap.created_at ?? snap.timestamp,
      );

      // Validate timestamp
      if (isNaN(recordedAt.getTime())) {
        errors++;
        continue;
      }

      // Reject future timestamps
      if (recordedAt > now) {
        futureTimestamps++;
        continue;
      }

      snapshotBatch.push({
        creatorProfileId,
        platform: "twitch" as Platform,
        snapshotAt: recordedAt, // PRESERVE ORIGINAL TIMESTAMP
        followerCount:
          snap.follower_count != null ? BigInt(snap.follower_count) : null,
        totalViews: snap.view_count != null ? BigInt(snap.view_count) : null,
        extendedMetrics:
          snap.viewer_count != null
            ? { LIVE_VIEWER_COUNT: snap.viewer_count }
            : undefined,
      });

      // Flush batch
      if (snapshotBatch.length >= SNAPSHOT_BATCH_SIZE) {
        try {
          const result = await prisma.metricSnapshot.createMany({
            data: snapshotBatch,
            skipDuplicates: true,
          });
          created += result.count;
        } catch (err) {
          errors += snapshotBatch.length;
          console.error(
            `  Batch insert error for channel ${twitchId}:`,
            (err as Error).message,
          );
        }
        snapshotBatch.length = 0;
      }

      processed++;
      if (processed % LOG_INTERVAL === 0) {
        console.log(
          `  Snapshots progress: ${processed}/${totalSnapshots} (created: ${created}, errors: ${errors})`,
        );
      }
    }

    // Flush remaining
    if (snapshotBatch.length > 0) {
      try {
        const result = await prisma.metricSnapshot.createMany({
          data: snapshotBatch,
          skipDuplicates: true,
        });
        created += result.count;
      } catch (err) {
        errors += snapshotBatch.length;
      }
    }
  }

  console.log(
    `\nSnapshot migration complete: ${created} created, ${skipped} skipped, ${errors} errors, ${futureTimestamps} future timestamps rejected`,
  );

  // Verification: check date ranges for a sample creator
  if (idMap.size > 0) {
    const sampleProfileId = Array.from(idMap.values())[0];
    const verify = await prisma.metricSnapshot.aggregate({
      where: { creatorProfileId: sampleProfileId },
      _count: true,
      _min: { snapshotAt: true },
      _max: { snapshotAt: true },
    });
    console.log(`\nVerification (sample creator ${sampleProfileId}):`);
    console.log(`  Snapshot count: ${verify._count}`);
    console.log(
      `  Date range: ${verify._min.snapshotAt} → ${verify._max.snapshotAt}`,
    );
  }
}

// ============================================================
// STEP 3: UPDATE AGGREGATE FIELDS
// ============================================================

async function updateAggregates(idMap: Map<string, string>): Promise<void> {
  console.log("\n=== STEP 3: UPDATING AGGREGATE FIELDS ===\n");

  if (DRY_RUN) {
    console.log("DRY RUN — skipping aggregate updates.");
    return;
  }

  let updated = 0;

  for (const creatorProfileId of idMap.values()) {
    // Get latest snapshot per platform to update PlatformAccount
    const latestSnapshots = await prisma.metricSnapshot.findMany({
      where: { creatorProfileId },
      orderBy: { snapshotAt: "desc" },
      distinct: ["platform"],
      take: 6, // Max 6 platforms
    });

    for (const snap of latestSnapshots) {
      await prisma.platformAccount.updateMany({
        where: { creatorProfileId, platform: snap.platform },
        data: {
          followerCount: snap.followerCount,
          totalViews: snap.totalViews,
          lastSyncedAt: snap.snapshotAt,
        },
      });
    }

    // Update CreatorProfile totalFollowers from platform accounts
    const accounts = await prisma.platformAccount.findMany({
      where: { creatorProfileId },
      select: { followerCount: true },
    });

    const totalFollowers = accounts.reduce(
      (sum: bigint, a: { followerCount: bigint | null }) =>
        sum + (a.followerCount ?? 0n),
      0n,
    );

    const latestSnapshot = latestSnapshots[0];
    await prisma.creatorProfile.update({
      where: { id: creatorProfileId },
      data: {
        totalFollowers,
        lastSnapshotAt: latestSnapshot?.snapshotAt ?? null,
      },
    });

    updated++;
    if (updated % 1000 === 0) {
      console.log(`  Updated aggregates for ${updated} creators`);
    }
  }

  console.log(`Aggregate updates complete: ${updated} creators updated`);
}

// ============================================================
// MAIN
// ============================================================

async function main(): Promise<void> {
  console.log("=== TwitchMetrics Legacy Data Migration ===");
  console.log(
    `Mode: ${DRY_RUN ? "DRY RUN" : INSPECT_ONLY ? "INSPECT" : "LIVE"}`,
  );
  if (LIMIT > 0) console.log(`Limit: ${LIMIT} records`);
  if (SKIP_SNAPSHOTS) console.log("Skipping snapshot migration");
  console.log();

  const pool = getLegacyConnection();

  try {
    // Test connection
    await pool.query("SELECT 1");
    console.log("Connected to legacy database.");

    if (INSPECT_ONLY) {
      await inspectLegacySchema(pool);
      return;
    }

    // Always inspect first
    await inspectLegacySchema(pool);

    // Migrate channels
    const idMap = await migrateChannels(pool);

    // Migrate snapshots
    if (!SKIP_SNAPSHOTS && idMap.size > 0) {
      await migrateSnapshots(pool, idMap);
    }

    // Update aggregates
    if (!DRY_RUN && idMap.size > 0) {
      await updateAggregates(idMap);
    }

    console.log("\n=== MIGRATION COMPLETE ===");
    console.log(`Total creators mapped: ${idMap.size}`);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

main();
