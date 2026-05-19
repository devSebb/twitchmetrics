/**
 * Backfill TalentManagerProfile rows for existing talent_manager users.
 *
 * Idempotent — uses upsert keyed on userId. Safe to re-run.
 *
 * Usage:
 *   tsx workers/backfill-tm-profiles.ts             # apply
 *   tsx workers/backfill-tm-profiles.ts --dry-run   # report only, no writes
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const prisma = new PrismaClient();

async function run(): Promise<void> {
  const managers = await prisma.user.findMany({
    where: { role: "talent_manager" },
    select: { id: true, talentManagerProfile: { select: { id: true } } },
  });

  const missing = managers.filter((m) => !m.talentManagerProfile);

  console.log(
    `Talent managers: ${managers.length} total, ${missing.length} missing profile`,
  );

  if (missing.length === 0 || DRY_RUN) return;

  let created = 0;
  for (const m of missing) {
    await prisma.talentManagerProfile.upsert({
      where: { userId: m.id },
      create: { userId: m.id },
      update: {},
    });
    created++;
  }

  console.log(`Created ${created} profile rows.`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
