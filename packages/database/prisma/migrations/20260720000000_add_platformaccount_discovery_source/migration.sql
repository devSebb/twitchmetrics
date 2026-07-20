-- Link-only social accounts (Instagram/TikTok/X) ingested from the StreamHatchet
-- social graph are marked with discoverySource = 'sh-social'. NULL for normal
-- tracked/OAuth accounts. Metric-fetch and token-refresh pipelines skip non-null.
ALTER TABLE "PlatformAccount" ADD COLUMN "discoverySource" TEXT;

-- Partial index so "give me a creator's link-only socials" and idempotent
-- upserts stay cheap without touching the hot path for tracked accounts.
CREATE INDEX "PlatformAccount_discoverySource_idx" ON "PlatformAccount" ("discoverySource") WHERE "discoverySource" IS NOT NULL;
