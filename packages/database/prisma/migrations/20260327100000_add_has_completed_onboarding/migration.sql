-- AlterTable
ALTER TABLE "User" ADD COLUMN "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing users with a name are considered onboarded
UPDATE "User" SET "hasCompletedOnboarding" = true WHERE "name" IS NOT NULL AND TRIM("name") != '';
