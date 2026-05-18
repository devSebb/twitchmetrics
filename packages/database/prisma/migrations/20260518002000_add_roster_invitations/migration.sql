-- CreateEnum
CREATE TYPE "RosterAccessStatus" AS ENUM ('pending', 'active', 'declined');

-- AlterTable
ALTER TABLE "TalentManagerAccess"
  ADD COLUMN "status"          "RosterAccessStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "inviteTokenHash" TEXT,
  ADD COLUMN "inviteExpiresAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt"      TIMESTAMP(3),
  ADD COLUMN "declinedAt"      TIMESTAMP(3);

-- Backfill: every existing row was a live, accepted relationship under the old direct-add model.
-- New rows from now on default to 'pending' and require explicit creator acceptance via rosterInvite.accept.
UPDATE "TalentManagerAccess"
   SET "status" = 'active',
       "acceptedAt" = "grantedAt";

-- CreateIndex
CREATE UNIQUE INDEX "TalentManagerAccess_inviteTokenHash_key" ON "TalentManagerAccess"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "TalentManagerAccess_status_revokedAt_idx" ON "TalentManagerAccess"("status", "revokedAt");

-- CreateIndex
CREATE INDEX "TalentManagerAccess_inviteExpiresAt_idx" ON "TalentManagerAccess"("inviteExpiresAt");
