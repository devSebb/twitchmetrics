-- StreamSessionFact uniqueness must include the platform video id.
--
-- YouTube channels run several concurrent live streams with distinct
-- video_id but identical stream_begins/stream_ends (24/7 news, radio, VTuber
-- multi-streams). The old unique (source, platform, platformUserId,
-- streamBeginsAt, streamEndsAt) made createMany(skipDuplicates) silently drop
-- ~4.2k yt rows/day (~8%; verified on the 2026-08-15 file: 54,107 rows ->
-- 49,909 written). Only an arbitrary one of each set survived.
--
-- COALESCE(platformVideoId, '') keeps the key NULL-safe (kick has no video
-- id; NULLs would otherwise be distinct and a retried import would duplicate
-- rows). Prisma cannot declare expression uniques, so this is a raw index —
-- `prisma migrate dev` will report drift and try to DROP it; remove that
-- statement before applying. See the warning block on model StreamSessionFact.
--
-- IF NOT EXISTS / IF EXISTS: applied to prod out-of-band with
-- CREATE UNIQUE INDEX CONCURRENTLY (cannot run inside a migration
-- transaction). Same pattern as 20260810120000_add_creator_list_sort_indexes.

CREATE UNIQUE INDEX IF NOT EXISTS "StreamSessionFact_source_platform_user_video_window_key"
  ON "StreamSessionFact" (source, platform, "platformUserId", (COALESCE("platformVideoId", '')), "streamBeginsAt", "streamEndsAt");

DROP INDEX IF EXISTS "StreamSessionFact_source_platform_platformUserId_streamBegi_key";
