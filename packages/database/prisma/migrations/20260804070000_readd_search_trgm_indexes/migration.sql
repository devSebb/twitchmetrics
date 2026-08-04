-- Re-add the trigram search indexes that 20260312174050_add_report_lead
-- dropped as schema drift (the 2026-03 originals were created raw and never
-- declared in schema.prisma). Without them /search does parallel seq scans
-- over ~1M CreatorProfile rows (~3.3s per query, twice per search).
-- IF NOT EXISTS: these may already be applied out-of-band with
-- CREATE INDEX CONCURRENTLY, which cannot run inside a migration transaction.
CREATE INDEX IF NOT EXISTS "CreatorProfile_searchText_idx" ON "CreatorProfile" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Game_searchText_idx" ON "Game" USING GIN ("searchText" gin_trgm_ops);
