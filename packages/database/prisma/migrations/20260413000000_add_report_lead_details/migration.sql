-- Add details JSONB column to ReportLead for storing report customization options
ALTER TABLE "ReportLead" ADD COLUMN "details" JSONB;
