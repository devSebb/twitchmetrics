/**
 * Weekly Digest Email Worker
 *
 * Standalone script that sends weekly digest emails to claimed/premium creators
 * with significant follower growth (|delta| >= 10) over the past 7 days.
 *
 * Usage:
 *   pnpm tsx workers/digest-email.ts
 *   pnpm tsx workers/digest-email.ts --dry-run
 */

import { PrismaClient } from "@prisma/client";
import { Resend } from "resend";

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const GROWTH_THRESHOLD = 10;
const BATCH_SIZE = 50;
const FROM_ADDRESS = "hello@twitchmetrics.net";

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

// ============================================================
// LOGGING
// ============================================================

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const prefix = `[digest-email] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  log("info", `Starting digest email worker${DRY_RUN ? " (dry run)" : ""}`);

  // Find all users with email who have a claimed/premium creator profile
  const users = await prisma.user.findMany({
    where: {
      email: { not: null },
      creatorProfile: {
        state: { in: ["claimed", "premium"] },
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      creatorProfile: {
        select: {
          id: true,
          displayName: true,
          slug: true,
        },
      },
    },
  });

  log("info", `Found ${users.length} eligible users`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);

    for (const user of batch) {
      if (!user.email || !user.creatorProfile) {
        skipped++;
        continue;
      }

      try {
        // Compute 7-day follower growth from growth rollups
        const rollups = await prisma.creatorGrowthRollup.findMany({
          where: {
            creatorProfileId: user.creatorProfile.id,
            computedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          select: {
            delta7d: true,
          },
        });

        const totalGrowth = rollups.reduce(
          (sum, r) => sum + (r.delta7d ?? 0),
          0,
        );

        if (Math.abs(totalGrowth) < GROWTH_THRESHOLD) {
          skipped++;
          continue;
        }

        const growthDirection = totalGrowth > 0 ? "gained" : "lost";
        const absGrowth = Math.abs(totalGrowth).toLocaleString();
        const displayName =
          user.creatorProfile.displayName || user.name || "Creator";
        const profileUrl = `https://twitchmetrics.net/creators/${user.creatorProfile.slug}`;

        const subject = `Your weekly digest: ${growthDirection} ${absGrowth} followers this week`;

        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h1 style="color: #E32C19; font-size: 24px; margin-bottom: 16px;">TwitchMetrics Weekly Digest</h1>
            <p style="font-size: 16px; color: #333;">Hey ${displayName},</p>
            <p style="font-size: 16px; color: #333;">
              Over the past 7 days, you ${growthDirection}
              <strong style="color: ${totalGrowth > 0 ? "#22c55e" : "#ef4444"};">${absGrowth}</strong>
              followers.
            </p>
            <p style="font-size: 16px; color: #333;">
              <a href="${profileUrl}" style="color: #E32C19; text-decoration: underline;">View your full analytics dashboard</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <p style="font-size: 12px; color: #9ca3af;">
              You're receiving this because you have a claimed profile on TwitchMetrics.
            </p>
          </div>
        `.trim();

        if (DRY_RUN) {
          log("info", `[DRY RUN] Would send to ${user.email}`, {
            displayName,
            totalGrowth,
            subject,
          });
          sent++;
          continue;
        }

        await resend.emails.send({
          from: FROM_ADDRESS,
          to: user.email,
          subject,
          html,
        });

        sent++;
        log("info", `Sent digest to ${user.email}`, { totalGrowth });
      } catch (err) {
        errors++;
        log("error", `Failed to process user ${user.id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  log("info", "Digest email worker completed", { sent, skipped, errors });

  await prisma.$disconnect();

  if (errors > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  log("error", "Fatal error in digest email worker", {
    error: err instanceof Error ? err.message : String(err),
  });
  prisma.$disconnect().finally(() => process.exit(1));
});
