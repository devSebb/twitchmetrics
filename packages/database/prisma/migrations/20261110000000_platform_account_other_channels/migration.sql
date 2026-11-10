-- Followers of a creator's other channels on the same platform (Stream
-- Hatchet contact data), added on top of followerCount like Stream Hatchet BI.
ALTER TABLE "PlatformAccount" ADD COLUMN "otherChannelsFollowerCount" BIGINT;
