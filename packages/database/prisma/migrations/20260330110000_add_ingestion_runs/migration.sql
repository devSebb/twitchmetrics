CREATE TABLE "IngestionRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "domain" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "platform" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsScanned" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "partialCount" INTEGER NOT NULL DEFAULT 0,
    "quotaUsed" INTEGER,
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IngestionRun_jobType_startedAt_idx"
ON "IngestionRun"("jobType", "startedAt" DESC);

CREATE INDEX "IngestionRun_domain_scope_startedAt_idx"
ON "IngestionRun"("domain", "scope", "startedAt" DESC);

CREATE INDEX "IngestionRun_platform_startedAt_idx"
ON "IngestionRun"("platform", "startedAt" DESC);

CREATE INDEX "IngestionRun_status_startedAt_idx"
ON "IngestionRun"("status", "startedAt" DESC);
