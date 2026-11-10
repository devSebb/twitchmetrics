/**
 * Minutes per game, from Stream Hatchet's per-game file
 * (s3://streamhatchet-aggregations/daily_sessions_games/sessions_games/
 *  {twitch,kick,yt}/day/year=…/month=…/day=…/YYYY-MM-DD.csv).
 *
 * The daily sessions file says WHICH games a stream had, never for how long,
 * so the rollups used to split every stream equally between them: xQc's
 * 11-07 stream was 50 % GTA V / 50 % Just Chatting, where SH's per-game file
 * has 587 min of GTA V and 63 of Just Chatting. That file lists one row per
 * (channel, game) stretch, clipped at UTC midnight:
 *
 *   "user_id","stream_begins","stream_ends","game","game_id","video_id"
 *   "71092938","1794096000","1794096120","Just Chatting","509658",
 *
 * Its stretches are matched to our StreamSessionFact rows and stored per day
 * on StreamSessionFact.gameMinutesByDay; buildRollups splits the day's
 * airtime and watch time in those proportions. Pure, so it is shared by the
 * worker and the rollup builder and tested without a database.
 */

/** Minutes per game name for one day. "" is time the file lists with no game. */
export type GameMinutes = Record<string, number>;
/** Keyed by UTC day, YYYY-MM-DD. */
export type GameMinutesByDay = Record<string, GameMinutes>;

export const NO_GAME = "";

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** One row of the per-game file. Times in epoch milliseconds. */
export type GameSegment = {
  userId: string;
  videoId: string | null;
  beginsAt: number;
  endsAt: number;
  game: string;
};

/** The fact columns the matcher needs. */
export type SegmentFact = {
  id: string;
  platformUserId: string;
  platformVideoId: string | null;
  streamBeginsAt: Date;
  streamEndsAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Read one day out of the stored JSON. Defensive: the column is plain JSONB,
 * so anything that is not { name: positive number } is ignored. Null when
 * the day has no usable minutes (the caller then splits equally).
 */
export function gameMinutesForDay(
  value: unknown,
  day: string,
): GameMinutes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[day];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const out: GameMinutes = {};
  let total = 0;
  for (const [name, minutes] of Object.entries(entry)) {
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) continue;
    if (minutes <= 0) continue;
    out[name] = minutes;
    total += minutes;
  }
  return total > 0 ? out : null;
}

/**
 * Split an integer total by weights (largest remainder), summing back to the
 * total exactly — the rollup columns are integers, and a rounded share per
 * game would lose or invent minutes.
 */
export function splitByWeights(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (weights.length === 0) return [];
  if (weightSum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (Math.max(0, w) / weightSum) * total);
  const shares = exact.map(Math.floor);
  let remainder = total - shares.reduce((sum, s) => sum + s, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; remainder > 0 && i < order.length; i++, remainder--) {
    const index = order[i]!.index;
    shares[index] = (shares[index] ?? 0) + 1;
  }
  return shares;
}

/**
 * The day's games in the order to credit them, case variants merged (first
 * spelling wins, as in categoriesOf), plus the minutes with no game.
 */
export function namedGameMinutes(minutes: GameMinutes): {
  games: Array<{ name: string; minutes: number }>;
  noGameMinutes: number;
} {
  const byKey = new Map<string, { name: string; minutes: number }>();
  let noGameMinutes = 0;
  for (const [rawName, value] of Object.entries(minutes)) {
    const name = rawName.trim();
    if (!name) {
      noGameMinutes += value;
      continue;
    }
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) existing.minutes += value;
    else byKey.set(key, { name, minutes: value });
  }
  const games = [...byKey.values()].sort(
    (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name),
  );
  return { games, noGameMinutes };
}

/**
 * Credit each stretch to the facts it overlaps inside the day, by minutes of
 * overlap. A stretch only counts toward a fact of the same channel and, when
 * both carry one, the same video id: a YouTube channel can run several
 * streams at once, and the file repeats the same times for each video.
 *
 * Returns minutes per fact (rounded to whole minutes, zero entries dropped)
 * and how many stretches matched no fact — a stream the sessions file did
 * not list, so there is no watch time to split.
 */
export function assignSegmentsToFacts(
  facts: SegmentFact[],
  segments: GameSegment[],
  dayStart: Date,
): { byFact: Map<string, GameMinutes>; unmatchedSegments: number } {
  const dayFrom = dayStart.getTime();
  const dayTo = dayFrom + DAY_MS;

  const factsByUser = new Map<string, SegmentFact[]>();
  for (const fact of facts) {
    const list = factsByUser.get(fact.platformUserId);
    if (list) list.push(fact);
    else factsByUser.set(fact.platformUserId, [fact]);
  }

  const raw = new Map<string, Map<string, number>>();
  let unmatchedSegments = 0;
  for (const segment of segments) {
    const candidates = factsByUser.get(segment.userId);
    let matched = false;
    if (candidates) {
      const from = Math.max(segment.beginsAt, dayFrom);
      const to = Math.min(segment.endsAt, dayTo);
      for (const fact of candidates) {
        if (
          segment.videoId &&
          fact.platformVideoId &&
          segment.videoId !== fact.platformVideoId
        ) {
          continue;
        }
        const overlap =
          Math.min(to, fact.streamEndsAt.getTime()) -
          Math.max(from, fact.streamBeginsAt.getTime());
        if (overlap <= 0) continue;
        matched = true;
        let perGame = raw.get(fact.id);
        if (!perGame) {
          perGame = new Map();
          raw.set(fact.id, perGame);
        }
        const name = segment.game.trim();
        perGame.set(name, (perGame.get(name) ?? 0) + overlap / 60_000);
      }
    }
    if (!matched) unmatchedSegments += 1;
  }

  const byFact = new Map<string, GameMinutes>();
  for (const [factId, perGame] of raw) {
    const minutes: GameMinutes = {};
    for (const [name, value] of perGame) {
      const rounded = Math.round(value);
      if (rounded > 0) minutes[name] = rounded;
    }
    if (Object.keys(minutes).length > 0) byFact.set(factId, minutes);
  }
  return { byFact, unmatchedSegments };
}

/**
 * True when the file adds nothing to the fact: the stream's only category,
 * the whole time (or no game at all on either side). Those days are not
 * stored — an equal split of one game is already exact — which keeps the
 * column to the ~20k multi-game streams a day instead of all ~160k.
 */
export function gameMinutesAddNothing(
  categories: string[],
  minutes: GameMinutes,
): boolean {
  const { games, noGameMinutes } = namedGameMinutes(minutes);
  if (noGameMinutes > 0) return categories.length === 0 && games.length === 0;
  if (games.length !== 1 || categories.length !== 1) return false;
  return games[0]!.name.toLowerCase() === categories[0]!.trim().toLowerCase();
}
