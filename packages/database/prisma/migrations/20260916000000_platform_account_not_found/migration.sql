-- Stop polling permanently-dead channels.
--
-- tier3-snapshot fails a stable ~2,540 rows/day (8.7%): deleted/banned Twitch
-- channels whose Helix /users lookup returns nothing. The adapter raises a
-- non-retryable AdapterError("not_found"), the loop counts it as a failure,
-- and the same accounts are retried every day forever.
--
-- The snapshot loop now counts consecutive not-founds here and skips an
-- account after 3; a successful snapshot (or an OAuth reconnect) resets the
-- counter. Typed columns rather than a Json blob: the tier query filters on
-- notFoundCount, and `NOT (metadata->>'x')::int >= 3` would also drop every
-- row with no metadata (NOT NULL is NULL).
--
-- Constant DEFAULT: PG >= 11 adds both columns without rewriting the table.

ALTER TABLE "PlatformAccount"
  ADD COLUMN IF NOT EXISTS "notFoundCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastNotFoundAt" TIMESTAMP(3);
