-- Index the daily rollups by platformUserId so ownership backfill (stamping
-- creatorProfileId onto SH facts/rollups) and daily ingest matching can seek by
-- channel instead of scanning. Without this the rollup UPDATEs fall back to a
-- full scan per batch (their other indexes lead with source/platform/date).
CREATE INDEX "ChannelDailyRollup_platformUserId_platform_idx"
  ON "ChannelDailyRollup" ("platformUserId", "platform");

CREATE INDEX "ChannelGameDailyRollup_platformUserId_platform_idx"
  ON "ChannelGameDailyRollup" ("platformUserId", "platform");
