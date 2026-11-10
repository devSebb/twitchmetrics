-- Minutes per game per day from Stream Hatchet's daily_sessions_games file.
ALTER TABLE "StreamSessionFact" ADD COLUMN "gameMinutesByDay" JSONB;
