/**
 * StreamHatchet Identity Linker
 *
 * Links imported StreamHatchet external channels to existing creator profiles.
 * Defaults to dry-run; pass --write to create platform accounts and backfill
 * creatorProfileId on imported session facts and rollups.
 *
 * Usage:
 *   pnpm worker:streamhatchet-link -- --platform kick
 *   pnpm worker:streamhatchet-link -- --platform kick --write
 */

import { PrismaClient, type Platform } from "@prisma/client";

const prisma = new PrismaClient();
const args = process.argv.slice(2);

const SOURCE = "streamhatchet";
const DEFAULT_LIMIT = 500;

type LinkStrategy = "exact";
type SourcePlatform = "kick";

type Config = {
  platform: SourcePlatform;
  targetPlatform: Platform;
  sourceMatchPlatform: Platform;
  strategy: LinkStrategy;
  write: boolean;
  limit: number;
  minMinutesWatched: bigint;
};

type ExistingAccount = {
  id: string;
  creatorProfileId: string;
  platformUserId: string;
  platformUsername: string;
};

type CreatorAccount = ExistingAccount & {
  creatorProfile: {
    id: string;
    displayName: string;
    slug: string;
    primaryPlatform: Platform;
    totalFollowers: bigint;
  };
};

type ImportedChannel = {
  platformUserId: string;
  platformUsername: string;
  platformDisplayName: string | null;
  platformLogoUrl: string | null;
  country: string | null;
  sessionCount: number;
  airtimeMinutes: number;
  minutesWatched: bigint;
  peakViewers: number | null;
  lastStreamAt: Date | null;
};

type Candidate = {
  channel: ImportedChannel;
  creatorAccount: CreatorAccount;
  existingTargetAccount: ExistingAccount | null;
};

type LinkResult = {
  candidate: Candidate;
  accountCreated: boolean;
  accountUpdated: boolean;
  streamSessionsUpdated: number;
  channelRollupsUpdated: number;
  channelGameRollupsUpdated: number;
};

function argValue(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBigIntArg(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseConfig(): Config {
  const platform = argValue("--platform") ?? "kick";
  if (platform !== "kick") {
    throw new Error(
      `Unsupported StreamHatchet identity platform '${platform}'. Currently supported: kick.`,
    );
  }

  const strategy = argValue("--strategy") ?? "exact";
  if (strategy !== "exact") {
    throw new Error(
      `Unsupported link strategy '${strategy}'. Currently supported: exact.`,
    );
  }

  return {
    platform,
    targetPlatform: "kick",
    sourceMatchPlatform: "twitch",
    strategy,
    write: args.includes("--write"),
    limit: parsePositiveInt(argValue("--limit"), DEFAULT_LIMIT),
    minMinutesWatched: parseBigIntArg(argValue("--min-minutes-watched"), 0n),
  };
}

function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>,
) {
  const ts = new Date().toISOString();
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  console[level](`[${ts}] [streamhatchet-link] ${message}${extra}`);
}

function usernameKey(value: string): string {
  return value.trim().toLowerCase();
}

function platformUrl(platform: Platform, username: string): string | null {
  if (platform === "kick") return `https://kick.com/${username}`;
  return null;
}

function compactBigInt(value: bigint): string {
  return value.toString();
}

async function loadImportedChannels(
  config: Config,
): Promise<ImportedChannel[]> {
  const rows = await prisma.channelDailyRollup.findMany({
    where: {
      source: SOURCE,
      platform: config.platform,
    },
    select: {
      platformUserId: true,
      platformUsername: true,
      platformDisplayName: true,
      platformLogoUrl: true,
      country: true,
      sessionCount: true,
      airtimeMinutes: true,
      minutesWatched: true,
      peakViewers: true,
      lastStreamAt: true,
      date: true,
    },
    orderBy: [{ date: "desc" }, { minutesWatched: "desc" }],
  });

  const byChannel = new Map<string, ImportedChannel>();

  for (const row of rows) {
    const existing = byChannel.get(row.platformUserId);
    if (!existing) {
      byChannel.set(row.platformUserId, {
        platformUserId: row.platformUserId,
        platformUsername: row.platformUsername,
        platformDisplayName: row.platformDisplayName,
        platformLogoUrl: row.platformLogoUrl,
        country: row.country,
        sessionCount: row.sessionCount,
        airtimeMinutes: row.airtimeMinutes,
        minutesWatched: row.minutesWatched,
        peakViewers: row.peakViewers,
        lastStreamAt: row.lastStreamAt,
      });
      continue;
    }

    existing.sessionCount += row.sessionCount;
    existing.airtimeMinutes += row.airtimeMinutes;
    existing.minutesWatched += row.minutesWatched;
    existing.peakViewers =
      existing.peakViewers === null
        ? row.peakViewers
        : row.peakViewers === null
          ? existing.peakViewers
          : Math.max(existing.peakViewers, row.peakViewers);
    existing.lastStreamAt =
      existing.lastStreamAt === null
        ? row.lastStreamAt
        : row.lastStreamAt === null
          ? existing.lastStreamAt
          : existing.lastStreamAt > row.lastStreamAt
            ? existing.lastStreamAt
            : row.lastStreamAt;
  }

  return [...byChannel.values()]
    .filter((channel) => channel.minutesWatched >= config.minMinutesWatched)
    .sort((a, b) =>
      a.minutesWatched === b.minutesWatched
        ? a.platformUsername.localeCompare(b.platformUsername)
        : a.minutesWatched > b.minutesWatched
          ? -1
          : 1,
    );
}

async function findCandidates(config: Config): Promise<{
  candidates: Candidate[];
  importedChannels: number;
  skippedExistingCreatorTarget: number;
  skippedExistingTargetUser: number;
  skippedNoUsernameMatch: number;
}> {
  const [channels, sourceAccounts, targetAccounts] = await Promise.all([
    loadImportedChannels(config),
    prisma.platformAccount.findMany({
      where: { platform: config.sourceMatchPlatform },
      select: {
        id: true,
        creatorProfileId: true,
        platformUserId: true,
        platformUsername: true,
        creatorProfile: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            primaryPlatform: true,
            totalFollowers: true,
          },
        },
      },
    }) as Promise<CreatorAccount[]>,
    prisma.platformAccount.findMany({
      where: { platform: config.targetPlatform },
      select: {
        id: true,
        creatorProfileId: true,
        platformUserId: true,
        platformUsername: true,
      },
    }),
  ]);

  const sourceByUsername = new Map<string, CreatorAccount[]>();
  for (const account of sourceAccounts) {
    const key = usernameKey(account.platformUsername);
    sourceByUsername.set(key, [...(sourceByUsername.get(key) ?? []), account]);
  }

  const targetByCreator = new Map(
    targetAccounts.map((account) => [account.creatorProfileId, account]),
  );
  const targetByUserId = new Map(
    targetAccounts.map((account) => [account.platformUserId, account]),
  );

  const candidates: Candidate[] = [];
  let skippedExistingCreatorTarget = 0;
  let skippedExistingTargetUser = 0;
  let skippedNoUsernameMatch = 0;

  for (const channel of channels) {
    const matches = sourceByUsername.get(usernameKey(channel.platformUsername));
    if (!matches?.length) {
      skippedNoUsernameMatch++;
      continue;
    }

    for (const creatorAccount of matches) {
      const existingCreatorTarget = targetByCreator.get(
        creatorAccount.creatorProfileId,
      );
      const existingTargetUser = targetByUserId.get(channel.platformUserId);

      if (
        existingCreatorTarget &&
        existingCreatorTarget.platformUserId !== channel.platformUserId
      ) {
        skippedExistingCreatorTarget++;
        continue;
      }

      if (
        existingTargetUser &&
        existingTargetUser.creatorProfileId !== creatorAccount.creatorProfileId
      ) {
        skippedExistingTargetUser++;
        continue;
      }

      candidates.push({
        channel,
        creatorAccount,
        existingTargetAccount:
          existingCreatorTarget ?? existingTargetUser ?? null,
      });
    }
  }

  return {
    candidates: candidates.slice(0, config.limit),
    importedChannels: channels.length,
    skippedExistingCreatorTarget,
    skippedExistingTargetUser,
    skippedNoUsernameMatch,
  };
}

async function linkCandidate(
  config: Config,
  candidate: Candidate,
): Promise<LinkResult> {
  const accountData = {
    platformUsername: candidate.channel.platformUsername,
    platformDisplayName:
      candidate.channel.platformDisplayName ??
      candidate.channel.platformUsername,
    platformUrl: platformUrl(
      config.targetPlatform,
      candidate.channel.platformUsername,
    ),
    platformAvatarUrl: candidate.channel.platformLogoUrl,
    lastSyncedAt: candidate.channel.lastStreamAt ?? new Date(),
  };

  let accountCreated = false;
  let accountUpdated = false;

  if (!candidate.existingTargetAccount) {
    await prisma.platformAccount.create({
      data: {
        creatorProfileId: candidate.creatorAccount.creatorProfileId,
        platform: config.targetPlatform,
        platformUserId: candidate.channel.platformUserId,
        ...accountData,
      },
    });
    accountCreated = true;
  } else {
    await prisma.platformAccount.update({
      where: { id: candidate.existingTargetAccount.id },
      data: accountData,
    });
    accountUpdated = true;
  }

  const [streamSessions, channelRollups, channelGameRollups] =
    await prisma.$transaction([
      prisma.streamSessionFact.updateMany({
        where: {
          source: SOURCE,
          platform: config.platform,
          platformUserId: candidate.channel.platformUserId,
        },
        data: { creatorProfileId: candidate.creatorAccount.creatorProfileId },
      }),
      prisma.channelDailyRollup.updateMany({
        where: {
          source: SOURCE,
          platform: config.platform,
          platformUserId: candidate.channel.platformUserId,
        },
        data: { creatorProfileId: candidate.creatorAccount.creatorProfileId },
      }),
      prisma.channelGameDailyRollup.updateMany({
        where: {
          source: SOURCE,
          platform: config.platform,
          platformUserId: candidate.channel.platformUserId,
        },
        data: { creatorProfileId: candidate.creatorAccount.creatorProfileId },
      }),
    ]);

  return {
    candidate,
    accountCreated,
    accountUpdated,
    streamSessionsUpdated: streamSessions.count,
    channelRollupsUpdated: channelRollups.count,
    channelGameRollupsUpdated: channelGameRollups.count,
  };
}

function candidateSummary(candidate: Candidate) {
  return {
    kickUsername: candidate.channel.platformUsername,
    kickUserId: candidate.channel.platformUserId,
    kickMinutesWatched: compactBigInt(candidate.channel.minutesWatched),
    kickPeakViewers: candidate.channel.peakViewers,
    twitchUsername: candidate.creatorAccount.platformUsername,
    creator: {
      displayName: candidate.creatorAccount.creatorProfile.displayName,
      slug: candidate.creatorAccount.creatorProfile.slug,
      primaryPlatform: candidate.creatorAccount.creatorProfile.primaryPlatform,
      totalFollowers: compactBigInt(
        candidate.creatorAccount.creatorProfile.totalFollowers,
      ),
    },
    action: candidate.existingTargetAccount
      ? "update-existing-target-account"
      : "create-target-account",
  };
}

async function main() {
  const config = parseConfig();
  log("info", "Starting StreamHatchet identity linking", {
    platform: config.platform,
    targetPlatform: config.targetPlatform,
    sourceMatchPlatform: config.sourceMatchPlatform,
    strategy: config.strategy,
    write: config.write,
    limit: config.limit,
    minMinutesWatched: compactBigInt(config.minMinutesWatched),
  });

  const discovery = await findCandidates(config);
  log("info", "Candidate discovery complete", {
    importedChannels: discovery.importedChannels,
    candidates: discovery.candidates.length,
    skippedNoUsernameMatch: discovery.skippedNoUsernameMatch,
    skippedExistingCreatorTarget: discovery.skippedExistingCreatorTarget,
    skippedExistingTargetUser: discovery.skippedExistingTargetUser,
    sample: discovery.candidates.slice(0, 20).map(candidateSummary),
  });

  if (!config.write) {
    log("info", "Dry run complete; pass --write to persist links.");
    return;
  }

  const run = await prisma.ingestionRun.create({
    data: {
      domain: "platform",
      scope: "identity-link",
      jobType: "streamhatchet-identity-link",
      platform: config.platform,
      status: "running",
      recordsScanned: discovery.importedChannels,
    },
  });

  const summary = {
    accountCreated: 0,
    accountUpdated: 0,
    streamSessionsUpdated: 0,
    channelRollupsUpdated: 0,
    channelGameRollupsUpdated: 0,
  };

  try {
    for (const candidate of discovery.candidates) {
      const result = await linkCandidate(config, candidate);
      if (result.accountCreated) summary.accountCreated++;
      if (result.accountUpdated) summary.accountUpdated++;
      summary.streamSessionsUpdated += result.streamSessionsUpdated;
      summary.channelRollupsUpdated += result.channelRollupsUpdated;
      summary.channelGameRollupsUpdated += result.channelGameRollupsUpdated;
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
        recordsWritten: summary.accountCreated,
        recordsSkipped:
          discovery.importedChannels - discovery.candidates.length,
        metadata: {
          platform: config.platform,
          targetPlatform: config.targetPlatform,
          sourceMatchPlatform: config.sourceMatchPlatform,
          strategy: config.strategy,
          candidates: discovery.candidates.length,
          accountUpdated: summary.accountUpdated,
          streamSessionsUpdated: summary.streamSessionsUpdated,
          channelRollupsUpdated: summary.channelRollupsUpdated,
          channelGameRollupsUpdated: summary.channelGameRollupsUpdated,
        },
      },
    });

    log("info", "Identity linking complete", summary);
  } catch (error) {
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        recordsWritten: summary.accountCreated,
        errorSummary:
          error instanceof Error ? error.message.slice(0, 1000) : String(error),
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    log("error", "StreamHatchet identity linking failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
