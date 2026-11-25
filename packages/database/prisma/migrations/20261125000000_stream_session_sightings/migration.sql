-- Per-export-day viewers for streams merged from several export windows.
-- Nullable, no default: adding it does not rewrite the table.
ALTER TABLE "StreamSessionFact" ADD COLUMN "sightingsByDay" JSONB;
