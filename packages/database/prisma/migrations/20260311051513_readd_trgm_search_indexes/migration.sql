-- Re-add GIN indexes for fuzzy search (pg_trgm extension already enabled)
CREATE INDEX IF NOT EXISTS idx_creator_search_trgm ON "CreatorProfile" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_game_search_trgm ON "Game" USING GIN ("searchText" gin_trgm_ops);
