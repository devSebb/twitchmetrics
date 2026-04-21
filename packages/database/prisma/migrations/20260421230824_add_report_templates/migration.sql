-- CreateEnum
CREATE TYPE "ReportPurchaseStatus" AS ENUM ('pending', 'paid', 'failed');

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "priceInCents" INTEGER NOT NULL DEFAULT 25000,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPurchase" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "templateId" UUID NOT NULL,
    "stripeSessionId" TEXT,
    "status" "ReportPurchaseStatus" NOT NULL DEFAULT 'pending',
    "formData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_slug_key" ON "ReportTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPurchase_stripeSessionId_key" ON "ReportPurchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ReportPurchase_email_idx" ON "ReportPurchase"("email");

-- CreateIndex
CREATE INDEX "ReportPurchase_stripeSessionId_idx" ON "ReportPurchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ReportPurchase_status_idx" ON "ReportPurchase"("status");

-- AddForeignKey
ALTER TABLE "ReportPurchase" ADD CONSTRAINT "ReportPurchase_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
