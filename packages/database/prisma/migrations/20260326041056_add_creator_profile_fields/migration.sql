-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "interests" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "language" TEXT;
