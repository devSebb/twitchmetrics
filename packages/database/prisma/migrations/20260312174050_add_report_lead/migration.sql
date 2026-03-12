-- DropIndex
DROP INDEX "idx_creator_search_trgm";

-- DropIndex
DROP INDEX "idx_game_search_trgm";

-- CreateTable
CREATE TABLE "ReportLead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportLead_email_idx" ON "ReportLead"("email");

-- CreateIndex
CREATE INDEX "ReportLead_createdAt_idx" ON "ReportLead"("createdAt");
