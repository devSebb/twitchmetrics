-- Safety net: convert any existing brand users to creator
UPDATE "User" SET "role" = 'creator' WHERE "role" = 'brand';

-- Remove 'brand' from UserRole enum
CREATE TYPE "UserRole_new" AS ENUM ('creator', 'talent_manager', 'admin');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'creator';
