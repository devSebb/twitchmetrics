/**
 * Repairs the historical merge invariant fixed in creator visibility:
 * a canonical profile must remain listed when it absorbed a listed profile.
 *
 * Dry-run is the default. Pass --write to update the affected canonical rows.
 */
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const write = process.argv.includes("--write");

type Candidate = { id: string };

async function findCandidates(): Promise<Candidate[]> {
  return prisma.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT DISTINCT cp.id
    FROM "CreatorProfile" cp
    JOIN "IdentityLink" il ON il."canonicalProfileId" = cp.id
    WHERE il.status = 'merged'
      AND cp."mergedIntoId" IS NULL
      AND cp."listed" = false
      AND COALESCE(
        (il.reversal->>'otherPriorListed')::boolean,
        false
      ) = true
    ORDER BY cp.id
  `);
}

async function main() {
  const candidates = await findCandidates();
  console.info(
    JSON.stringify({
      mode: write ? "write" : "dry-run",
      candidates: candidates.length,
    }),
  );

  if (!write || candidates.length === 0) return;

  const result = await prisma.creatorProfile.updateMany({
    where: {
      id: { in: candidates.map((candidate) => candidate.id) },
      listed: false,
      mergedIntoId: null,
    },
    data: { listed: true },
  });

  console.info(JSON.stringify({ repaired: result.count }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
