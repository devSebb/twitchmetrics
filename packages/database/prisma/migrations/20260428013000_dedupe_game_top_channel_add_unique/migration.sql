-- Step 1: Drop duplicate (gameId, channelName) rows.
-- Keep the row with the most recent updatedAt; break ties by id ASC.
-- A row is a duplicate if there exists another row in the same group that is
-- "newer" by (updatedAt DESC, id ASC).
DELETE FROM "GameTopChannel" gtc
USING "GameTopChannel" other
WHERE gtc."gameId" = other."gameId"
  AND gtc."channelName" = other."channelName"
  AND gtc.id <> other.id
  AND (
    gtc."updatedAt" < other."updatedAt"
    OR (gtc."updatedAt" = other."updatedAt" AND gtc.id > other.id)
  );

-- Step 2: Enforce uniqueness going forward.
CREATE UNIQUE INDEX "GameTopChannel_gameId_channelName_key"
  ON "GameTopChannel" ("gameId", "channelName");
