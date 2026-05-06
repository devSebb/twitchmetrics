-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('gaming', 'irl', 'music', 'creative', 'sports', 'other');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "vertical" "Vertical" NOT NULL DEFAULT 'gaming';

-- CreateIndex
CREATE INDEX "Game_vertical_currentViewers_idx" ON "Game"("vertical", "currentViewers" DESC);
