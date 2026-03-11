-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes for fast fuzzy/LIKE search
CREATE INDEX idx_creator_search_trgm ON "CreatorProfile" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX idx_game_search_trgm ON "Game" USING GIN ("searchText" gin_trgm_ops);
