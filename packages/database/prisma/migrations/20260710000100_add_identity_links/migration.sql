-- Cross-platform identity: soft-merge pointer + IdentityLink proposals/decisions.

CREATE TYPE "IdentitySignal" AS ENUM ('contact_id', 'admin', 'oauth', 'bio_link', 'handle_match');
CREATE TYPE "IdentityLinkStatus" AS ENUM ('proposed', 'confirmed', 'merged', 'rejected');

-- Soft-merge pointer: a merged profile becomes a redirect stub -> canonical.
ALTER TABLE "CreatorProfile"
  ADD COLUMN "mergedIntoId" UUID;

ALTER TABLE "CreatorProfile"
  ADD CONSTRAINT "CreatorProfile_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "CreatorProfile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CreatorProfile_mergedIntoId_idx" ON "CreatorProfile" ("mergedIntoId");

CREATE TABLE "IdentityLink" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "canonicalProfileId" UUID NOT NULL,
  "otherProfileId" UUID NOT NULL,
  "signal" "IdentitySignal" NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "status" "IdentityLinkStatus" NOT NULL DEFAULT 'proposed',
  "evidence" JSONB,
  "reversal" JSONB,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IdentityLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityLink_canonicalProfileId_otherProfileId_signal_key"
  ON "IdentityLink" ("canonicalProfileId", "otherProfileId", "signal");
CREATE INDEX "IdentityLink_status_confidence_idx"
  ON "IdentityLink" ("status", "confidence" DESC);
CREATE INDEX "IdentityLink_otherProfileId_idx"
  ON "IdentityLink" ("otherProfileId");

ALTER TABLE "IdentityLink"
  ADD CONSTRAINT "IdentityLink_canonicalProfileId_fkey"
  FOREIGN KEY ("canonicalProfileId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IdentityLink"
  ADD CONSTRAINT "IdentityLink_otherProfileId_fkey"
  FOREIGN KEY ("otherProfileId") REFERENCES "CreatorProfile"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
