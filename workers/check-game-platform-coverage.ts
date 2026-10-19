/**
 * Which top games are missing a platform, and why.
 *
 * Game pages add Twitch (our API snapshots), Kick (Kick API, via a Kick
 * category mapped to the game) and YouTube (Stream Hatchet daily rollups,
 * matched to the game by name). A game with no Kick mapping, or whose SH name
 * matches no catalog game, silently shows only part of its audience — QA
 * 2026-10 found GTA V, Marvel Rivals, Deadlock, ARC Raiders and CS2 short.
 *
 * Read-only. Prints, for the top games by Twitch 7-day average:
 *   - each platform's 7-day average viewers, or "—" with the reason;
 *   - the Kick categories mapped to it;
 * then the top YouTube games in the newest SH rollup that match no game.
 *
 * Options:
 *   --top N    games to list (default 40)
 *
 * Usage: npx tsx --env-file=apps/web/.env.local workers/check-game-platform-coverage.ts
 */
import { prisma } from "@twitchmetrics/database";

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const TOP = Number.parseInt(argValue("--top") ?? "40", 10) || 40;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MINUTES_PER_DAY = 1440;

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function fmt(value: number | null): string {
  return value === null ? "—" : Math.round(value).toLocaleString("en-US");
}

async function main() {
  const since = new Date(Date.now() - WEEK_MS);

  const games = await prisma.game.findMany({
    orderBy: { avgViewers7d: "desc" },
    take: TOP,
    select: { id: true, name: true, avgViewers7d: true },
  });
  const ids = games.map((g) => g.id);

  const [twitch, platformAvgs, kickMappings] = await Promise.all([
    prisma.gameViewerSnapshot.groupBy({
      by: ["gameId"],
      where: { gameId: { in: ids }, snapshotAt: { gte: since } },
      _avg: { twitchViewers: true },
    }),
    prisma.gamePlatformViewerSnapshot.groupBy({
      by: ["gameId", "platform", "source"],
      where: { gameId: { in: ids }, bucketStartedAt: { gte: since } },
      _avg: { viewers: true },
      _count: { _all: true },
    }),
    prisma.platformGameMapping.findMany({
      where: {
        gameId: { in: ids },
        platform: "kick",
        NOT: { platformGameId: { startsWith: "streamhatchet:" } },
      },
      select: { gameId: true, platformGameName: true },
    }),
  ]);

  const twitchBy = new Map(twitch.map((r) => [r.gameId, r._avg.twitchViewers]));
  const avgBy = (gameId: string, platform: string, source: string) =>
    platformAvgs.find(
      (r) =>
        r.gameId === gameId && r.platform === platform && r.source === source,
    );

  console.log(
    [
      "game",
      "twitch 7d",
      "kick 7d (n)",
      "youtube 7d (days)",
      "kick mappings",
    ].join("\t"),
  );
  let kickMissing = 0;
  let youtubeMissing = 0;
  for (const game of games) {
    const kick = avgBy(game.id, "kick", "kick_api");
    const youtube = avgBy(game.id, "youtube", "streamhatchet_daily");
    const mapped = kickMappings
      .filter((m) => m.gameId === game.id)
      .map((m) => m.platformGameName);
    if (!kick) kickMissing++;
    if (!youtube) youtubeMissing++;
    console.log(
      [
        game.name,
        fmt(twitchBy.get(game.id) ?? null),
        kick
          ? `${fmt(kick._avg.viewers)} (${kick._count._all})`
          : mapped.length
            ? "— (mapped, no snapshots)"
            : "— (NO MAPPING)",
        youtube
          ? `${fmt(youtube._avg.viewers)} (${youtube._count._all})`
          : "— (no match)",
        mapped.join(" | ") || "-",
      ].join("\t"),
    );
  }
  console.log(
    `\n${kickMissing}/${games.length} without Kick, ${youtubeMissing}/${games.length} without YouTube`,
  );

  // YouTube: the newest day's biggest SH games that match no catalog game.
  const newest = await prisma.gameDailyRollup.findFirst({
    where: { source: "streamhatchet", platform: "yt" },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!newest) return;
  const [ytGames, catalog] = await Promise.all([
    prisma.gameDailyRollup.findMany({
      where: { source: "streamhatchet", platform: "yt", date: newest.date },
      orderBy: { minutesWatched: "desc" },
      take: 60,
      select: { gameName: true, minutesWatched: true },
    }),
    prisma.game.findMany({ select: { name: true } }),
  ]);
  const known = new Set(catalog.map((g) => normalizeName(g.name)));
  const unmatched = ytGames.filter(
    (r) => !known.has(normalizeName(r.gameName)),
  );
  // A mapping under another platform (SH discovery, Kick) may already tie the
  // SH name to a catalog game — "Counter-Strike" -> Counter-Strike 2.
  const viaMapping = await prisma.platformGameMapping.findMany({
    where: {
      platformGameName: {
        in: unmatched.map((r) => r.gameName),
        mode: "insensitive",
      },
    },
    select: {
      platform: true,
      platformGameName: true,
      source: true,
      game: { select: { name: true } },
    },
  });
  console.log(
    `\nYouTube ${newest.date.toISOString().slice(0, 10)}: top SH games with no catalog match`,
  );
  for (const row of unmatched) {
    const mapped = viaMapping
      .filter(
        (m) =>
          normalizeName(m.platformGameName) === normalizeName(row.gameName),
      )
      .map((m) => `${m.game.name} via ${m.platform}/${m.source}`);
    console.log(
      `  ${row.gameName}\t${fmt(Number(row.minutesWatched) / MINUTES_PER_DAY)} avg viewers\t${[...new Set(mapped)].join("; ") || "-"}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
