-- Indexes backing the /creators listing sorts. Both were measured with
-- EXPLAIN (ANALYZE, BUFFERS) against prod on 2026-08-10:
--
--   ?platform=twitch (ORDER BY COALESCE(followerCount, subscriberCount)
--   DESC NULLS LAST): parallel seq scan over 578k PlatformAccount rows +
--   external merge sort to disk (7.7MB/worker) = 563ms -> index scan 2.2ms.
--
--   ?sort=recent (ORDER BY createdAt DESC): parallel seq scan over ~1M
--   CreatorProfile rows + top-N heapsort = 383ms -> index scan 0.3ms.
--
-- IF NOT EXISTS: already applied to prod out-of-band with
-- CREATE INDEX CONCURRENTLY, which cannot run inside a migration
-- transaction. Same pattern as 20260804070000_readd_search_trgm_indexes.

-- Declared in schema.prisma as @@index([createdAt(sort: Desc)]).
CREATE INDEX IF NOT EXISTS "CreatorProfile_createdAt_idx" ON "CreatorProfile" ("createdAt" DESC);

-- NOT declarable in schema.prisma: Prisma supports neither expression
-- indexes (COALESCE) nor NULLS LAST ordering. A `prisma migrate dev` run
-- will report this as drift and try to DROP it — remove that statement
-- before applying. See the warning block on model PlatformAccount.
-- INCLUDE ("creatorProfileId") keeps the join's probe column in the index.
CREATE INDEX IF NOT EXISTS "PlatformAccount_platform_audience_idx"
  ON "PlatformAccount" (platform, (COALESCE("followerCount", "subscriberCount")) DESC NULLS LAST)
  INCLUDE ("creatorProfileId");
