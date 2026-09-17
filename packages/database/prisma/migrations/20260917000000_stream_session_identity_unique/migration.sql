-- One row per stream, for the stream's whole life.
--
-- Each StreamHatchet daily export carries a rolling 3-day window, so a stream
-- still live at the cut reappears in the next file with the same video id but
-- a SLID begin/end. Measured on prod 2026-09-16 over 3,000 duplicated yt
-- streams: 2,956 had a later begin in the newest file (the window slides, it
-- does not nest); every sighting is capped at the window (max 4,319 min) while
-- the true streams ran a median 37,439 min (~26 days) — 24/7 channels. The old
-- key included (streamBeginsAt, streamEndsAt), so each slid copy inserted a new
-- row: yt airtime +199%, yt watch time +109%, and 14.65% of yt daily rollups
-- claimed more than 24 h in a day.
--
-- New identity: video-id platforms key on the video id alone; kick (no video
-- id) keeps its begin time, verified not to slide (102 overlapping pairs in
-- 104,751 rows over 7 days). The '1970-01-01' sentinel keeps both expressions
-- NOT NULL: Postgres treats NULLs in a unique index as DISTINCT, so a bare
-- `CASE WHEN platformVideoId IS NULL THEN streamBeginsAt END` would evaluate
-- to NULL for every video-id row and never conflict.
--
-- ORDER OF OPERATIONS (the index cannot be created while duplicates exist):
--   1. npx tsx workers/dedupe-stream-sessions.ts --platform yt --write
--      (then twitch, kick) — merges each identity group into one row.
--   2. Apply this migration out-of-band with CREATE UNIQUE INDEX CONCURRENTLY,
--      then DROP the old index.
--   3. Deploy the code that upserts on this key.
--   4. Recompute rollups for the affected range (worker --recompute-rollups).
--
-- IF NOT EXISTS / IF EXISTS: same out-of-band pattern as
-- 20260817000000_stream_session_video_id_unique.

CREATE UNIQUE INDEX IF NOT EXISTS "StreamSessionFact_stream_identity_key"
  ON "StreamSessionFact" (
    source, platform, "platformUserId",
    (COALESCE("platformVideoId", '')),
    (COALESCE(CASE WHEN "platformVideoId" IS NULL THEN "streamBeginsAt" END,
              TIMESTAMP '1970-01-01'))
  );

DROP INDEX IF EXISTS "StreamSessionFact_source_platform_user_video_window_key";
