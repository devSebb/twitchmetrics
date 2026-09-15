-- One GameViewerSnapshot per game per game-snapshot slot.
--
-- game-snapshot (cron */30) used to stamp snapshotAt = now(). A step killed at
-- maxDuration and retried re-inserted rows for the same slot (one game had 10
-- snapshots in 3 h where 6 were scheduled), which skewed avgViewers7d. The job
-- now floors snapshotAt to the 30-minute cron slot (memoized per run) and
-- inserts with createMany(skipDuplicates), so this unique key turns a retry
-- into a no-op. Declared in schema.prisma as @@unique([gameId, snapshotAt]).
--
-- Historical rows carry millisecond now() timestamps, so exact (gameId,
-- snapshotAt) duplicates should not exist. Check before creating the index:
--
--   SELECT "gameId", "snapshotAt", count(*) FROM "GameViewerSnapshot"
--   GROUP BY 1, 2 HAVING count(*) > 1;
--
-- If that returns rows, delete all but one per group first:
--
--   DELETE FROM "GameViewerSnapshot" s USING "GameViewerSnapshot" d
--   WHERE s."gameId" = d."gameId" AND s."snapshotAt" = d."snapshotAt"
--     AND s.id > d.id;
--
-- IF NOT EXISTS / IF EXISTS: apply to prod out-of-band with
-- CREATE UNIQUE INDEX CONCURRENTLY (cannot run inside a migration
-- transaction), then record with `prisma migrate deploy` on DIRECT_URL.
-- Same pattern as 20260817000000_stream_session_video_id_unique.

CREATE UNIQUE INDEX IF NOT EXISTS "GameViewerSnapshot_gameId_snapshotAt_key"
  ON "GameViewerSnapshot" ("gameId", "snapshotAt");

-- The unique index serves every lookup the old non-unique one did.
DROP INDEX IF EXISTS "GameViewerSnapshot_gameId_snapshotAt_idx";
