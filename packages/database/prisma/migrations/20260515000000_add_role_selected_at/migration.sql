-- Add roleSelectedAt to User: tracks whether the user explicitly chose
-- their role (during signup or onboarding) vs. having the default applied.
ALTER TABLE "User" ADD COLUMN "roleSelectedAt" TIMESTAMP(3);

-- Backfill existing users who have completed onboarding: their role
-- has been confirmed, so they shouldn't be re-prompted.
UPDATE "User"
SET "roleSelectedAt" = COALESCE("updatedAt", "createdAt")
WHERE "hasCompletedOnboarding" = TRUE;
