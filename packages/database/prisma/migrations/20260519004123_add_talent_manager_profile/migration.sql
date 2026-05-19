-- CreateTable
CREATE TABLE "TalentManagerProfile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "agencyName" TEXT,
    "bio" TEXT,
    "websiteUrl" TEXT,
    "country" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TalentManagerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TalentManagerProfile_userId_key" ON "TalentManagerProfile"("userId");

-- AddForeignKey
ALTER TABLE "TalentManagerProfile" ADD CONSTRAINT "TalentManagerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
