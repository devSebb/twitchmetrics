/**
 * Which catalog game a Stream Hatchet game name belongs to — one rule for
 * every reader of SH's game names (game pages, creator pages, /creators,
 * the live and daily game snapshots, workers/enrich-sh-profiles.ts).
 *
 * SH's names change under us. Its October 2026 IGDB re-run renamed games
 * on every platform ("Helldivers II" → "Helldivers 2", "Metin 2" → "Metin2",
 * Kick's lowercase names → Title Case), and SH will re-export all history
 * that way over the coming months (QA answers, 2026-11). A 30-day window
 * holds days under both spellings, so a name only our catalog knows misses
 * half of them. A name resolves, in order, through:
 *   1. the catalog name (case and spacing ignored),
 *   2. names SH's game discovery tied to a catalog game (PlatformGameMapping,
 *      source streamhatchet_discovery: SH files CS2 as "Counter-Strike"),
 *   3. STREAMHATCHET_GAME_NAME_OVERRIDES, for names neither covers.
 *
 * Relative imports only: plain-tsx workers import this file.
 */
import type { PrismaClient } from "@twitchmetrics/database";
import { Prisma } from "@twitchmetrics/database";

/** Canonical identity used by every popular-game data source. */
export function normalizePopularGameName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The same key in SQL, for queries that match names in the database. Equal
 * to normalizePopularGameName for every name SH sends (NFKC only changes
 * full-width and ligature characters).
 */
export function normalizedGameNameSql(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`lower(regexp_replace(btrim(${column}), '\\s+', ' ', 'g'))`;
}

/**
 * SH names that neither the catalog nor SH's discovery ties to the game they
 * are, checked by hand against the rollups (2026-11-04), keyed by catalog
 * slug. Most are the old spelling of a game IGDB renamed in October: days
 * before the rename still carry it.
 */
export const STREAMHATCHET_GAME_NAME_OVERRIDES: Readonly<
  Record<string, string>
> = {
  "Phantom Blade Zero": "phantom-blade-0",
  "Metin 2": "metin2",
  "Helldivers II": "helldivers-2-1",
  "Sonic Racing CrossWorlds": "sonic-racing-crossworlds",
  "Kingdom Hearts HD I.5 + II.5 Remix": "kingdom-hearts-hd-1-5-2-5-remix",
  bombanana: "bombanana",
  "Persona 3 Reload": "persona3-reload",
  "atlus persona 5 the royal": "persona-5-royal",
  "Fears to Fathom: Scratch Creek": "fears-to-fathom-scratch-creek",
};

/**
 * YouTube's own video categories. SH files a YouTube stream under one when it
 * has no game, so these are whole slices of YouTube, not games: "Sports" (every
 * sports broadcast, ~440k average viewers) landed on the Twitch "Sports"
 * category and multiplied it 40x (QA 2026-10). On YouTube they never match a
 * game; on Twitch and Kick the same names are real categories.
 */
export const YOUTUBE_VIDEO_CATEGORIES: ReadonlySet<string> = new Set(
  [
    "Autos & Vehicles",
    "Animals",
    "Pets & Animals",
    "Comedy",
    "Education",
    "Entertainment",
    "Film & Animation",
    "Gaming",
    "Howto & Style",
    "Movies",
    "Music",
    "News & Politics",
    "Nonprofits & Activism",
    "People",
    "People & Blogs",
    "Science & Technology",
    "Shows",
    "Sports",
    "Trailers",
    "Travel",
    "Travel & Events",
  ].map(normalizePopularGameName),
);

export function isYouTubeVideoCategory(name: string): boolean {
  return YOUTUBE_VIDEO_CATEGORIES.has(normalizePopularGameName(name));
}

/** SH's YouTube feed codes, and ours. */
function isYouTube(platform: string): boolean {
  return platform === "yt" || platform === "ytg" || platform === "youtube";
}

export type GameNameSources = {
  games: { id: string; name: string }[];
  aliases: { name: string; gameId: string }[];
};

/**
 * Index games by their normalised name, so rollup names (which come from the
 * export, with whatever spacing and case it used) resolve to a game id.
 * The catalog is ~1,400 rows, so one full read beats a query per name.
 *
 * A catalog name always wins over an alias, and an alias claimed by two
 * games is dropped. Look names up with gameIdForName, which knows YouTube's
 * video categories.
 */
export function indexGamesByName(
  games: GameNameSources["games"],
  aliases: GameNameSources["aliases"] = [],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const game of games) {
    const key = normalizePopularGameName(game.name);
    // First writer wins: two catalog rows normalising to one name would
    // otherwise flip between imports.
    if (!index.has(key)) index.set(key, game.id);
  }

  const aliasIndex = new Map<string, string | null>();
  for (const alias of aliases) {
    const key = normalizePopularGameName(alias.name);
    if (index.has(key)) continue;
    const existing = aliasIndex.get(key);
    if (existing === undefined) aliasIndex.set(key, alias.gameId);
    else if (existing !== alias.gameId) aliasIndex.set(key, null);
  }
  for (const [key, gameId] of aliasIndex) {
    if (gameId) index.set(key, gameId);
  }
  return index;
}

/** The game an SH name on `platform` (SH's code or ours) belongs to. */
export function gameIdForName(
  index: Map<string, string>,
  name: string,
  platform: string,
): string | undefined {
  if (isYouTube(platform) && isYouTubeVideoCategory(name)) return undefined;
  return index.get(normalizePopularGameName(name));
}

/**
 * Stream Hatchet's names for a game: its catalog name plus every alias, kept
 * only where the index resolves them to this game. For YouTube rows, drop
 * the video categories (isYouTubeVideoCategory).
 */
export function streamHatchetNamesFor(
  gameId: string,
  sources: GameNameSources,
  index: Map<string, string>,
): string[] {
  const candidates = [
    ...sources.games.filter((g) => g.id === gameId).map((g) => g.name),
    ...sources.aliases.filter((a) => a.gameId === gameId).map((a) => a.name),
  ];
  return [
    ...new Set(
      candidates.filter(
        (name) => index.get(normalizePopularGameName(name)) === gameId,
      ),
    ),
  ];
}

const SOURCES_TTL_MS = 10 * 60 * 1000;
const sourcesCache = new WeakMap<
  object,
  { expiresAt: number; value: Promise<GameNameSources> }
>();

/**
 * The catalog and every alias, read once per 10 minutes per client: creator
 * pages call this on every render, and discovery adds aliases a few times a
 * day at most.
 */
export function loadGameNameSources(
  db: PrismaClient,
): Promise<GameNameSources> {
  const cached = sourcesCache.get(db);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = Promise.all([
    db.game.findMany({ select: { id: true, name: true, slug: true } }),
    db.platformGameMapping.findMany({
      where: { source: "streamhatchet_discovery" },
      select: { platformGameName: true, gameId: true },
    }),
  ]).then(([games, mappings]) => {
    const idBySlug = new Map(games.map((game) => [game.slug, game.id]));
    const overrides = Object.entries(STREAMHATCHET_GAME_NAME_OVERRIDES).flatMap(
      ([name, slug]) => {
        const gameId = idBySlug.get(slug);
        return gameId ? [{ name, gameId }] : [];
      },
    );
    return {
      games: games.map(({ id, name }) => ({ id, name })),
      aliases: [
        ...mappings.flatMap((mapping) =>
          mapping.platformGameName
            ? [{ name: mapping.platformGameName, gameId: mapping.gameId }]
            : [],
        ),
        ...overrides,
      ],
    };
  });
  value.catch(() => sourcesCache.delete(db));
  sourcesCache.set(db, { expiresAt: Date.now() + SOURCES_TTL_MS, value });
  return value;
}

/**
 * The exact spellings the rollups used for these names since `since`.
 * Rollup reads match "gameName" exactly (that's what the indexes are
 * sorted by), and SH changed case on renames: Kick's "counter-strike" is
 * "Counter-Strike" now, "bombanana!" is "Bombanana!".
 */
export async function streamHatchetNameVariants(
  db: PrismaClient,
  names: string[],
  since: Date,
): Promise<string[]> {
  if (names.length === 0) return [];
  const keys = [...new Set(names.map(normalizePopularGameName))];
  // Naming the platforms lets the (source, platform, date, gameName) index
  // serve the read: ~100 ms for a week, against ~300 ms for a table scan.
  const rows = await db.$queryRaw<{ gameName: string }[]>(Prisma.sql`
    SELECT DISTINCT "gameName"
    FROM "GameDailyRollup"
    WHERE source = 'streamhatchet'
      AND platform = ANY(${["twitch", "kick", "yt", "ytg"]}::text[])
      AND date >= ${since}::date
      AND ${normalizedGameNameSql(Prisma.sql`"gameName"`)} = ANY(${keys}::text[])
  `);
  return [...new Set([...names, ...rows.map((row) => row.gameName)])];
}

/**
 * Every spelling SH used for a game since `since`, ready for exact-match
 * rollup reads. `youtube` leaves out the video categories, for yt/ytg rows.
 */
export async function streamHatchetNamesForGame(
  db: PrismaClient,
  gameId: string,
  since: Date,
): Promise<{ all: string[]; youtube: string[] }> {
  const sources = await loadGameNameSources(db);
  const index = indexGamesByName(sources.games, sources.aliases);
  const names = await streamHatchetNameVariants(
    db,
    streamHatchetNamesFor(gameId, sources, index),
    since,
  );
  return {
    all: names,
    youtube: names.filter((name) => !isYouTubeVideoCategory(name)),
  };
}
