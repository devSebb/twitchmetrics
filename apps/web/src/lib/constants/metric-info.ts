/**
 * What each number on the site means and where it comes from — the text in
 * the "?" cards (components/shared/InfoTip). One place, so the explanation of
 * a metric reads the same on every page that shows it.
 *
 * Keep each entry true to the code that computes the number: when the
 * calculation changes, this text changes with it.
 */

export type MetricInfo = {
  /** The metric's name, as the card's heading. */
  title: string;
  /** What the number is, in one or two plain sentences. */
  body: string;
  /** Where the data comes from. */
  source: string;
  /** The exact period covered, when the caller knows it. */
  window?: string;
};

const SH_DAILY = "Stream Hatchet daily stream data";

export const CREATOR_STATS_INFO = {
  period: {
    title: "Stats period",
    body: "Each period is that many whole days (UTC), ending on the newest day with complete data. Today isn't included yet: a day's data arrives the following morning.",
    source: `${SH_DAILY}, plus our own platform readings`,
  },
  airtime: {
    title: "Airtime",
    body: "Total time live in the period. Simulcasts count once: overlapping streams on different platforms are merged into real time.",
    source: `${SH_DAILY}. Twitch VODs fill days Stream Hatchet missed.`,
  },
  avgAirtime: {
    title: "Avg Airtime",
    body: "Airtime divided by the number of streams in the period. A stream is one continuous live block, across platforms.",
    source: `${SH_DAILY}. Twitch VODs fill days Stream Hatchet missed.`,
  },
  peakViewers: {
    title: "Peak Viewers",
    body: "The highest audience on a single platform in the period.",
    source: `${SH_DAILY} (daily peak per channel). Creators Stream Hatchet doesn't cover: the highest of our own live readings.`,
  },
  avgViewers: {
    title: "Avg Viewers",
    body: "Average concurrent viewers while live: total minutes watched divided by airtime, across all platforms.",
    source: `${SH_DAILY}. Creators Stream Hatchet doesn't cover use the average of our own periodic platform readings.`,
  },
  newFollowers: {
    title: "New Followers",
    body: "Change in followers between a reading at the start of the period and one at its end, added up across platforms. Shows “—” when we don't have a recent enough reading at both ends to measure it.",
    source:
      "Platform APIs (Twitch, YouTube) and Stream Hatchet follower counts",
  },
} satisfies Record<string, MetricInfo>;

const FOLLOWER_SOURCES =
  "Twitch and YouTube APIs for channels we track closely; Stream Hatchet for every other channel (weekly for Twitch, YouTube and Kick, monthly for Instagram, TikTok and X).";

export const CREATOR_HEADER_INFO = {
  totalFollowers: {
    title: "Total Followers",
    body: "The latest follower count on each of the creator's platforms, added together. A creator with several channels on one platform (two YouTube channels, say) has those added together too, as in Stream Hatchet. Someone who follows on two platforms counts twice.",
    source: FOLLOWER_SOURCES,
  },
} satisfies Record<string, MetricInfo>;

/** One card per creator-page widget, shown beside the widget's title. */
export const CREATOR_WIDGET_INFO: Partial<Record<string, MetricInfo>> = {
  follower_growth: {
    title: "Follower Growth",
    body: "Follower count over time, from each reading we've recorded. Platforms we only know through a linked handle (some Instagram, TikTok and X accounts) have a current count but no history yet.",
    source: FOLLOWER_SOURCES,
  },
  demographics: {
    title: "Audience Demographics",
    body: "Who follows the creator on social media (Instagram, TikTok, X, YouTube): an estimate, not the people watching their streams. Reports can be months old; the date is shown under the chart. Claimed creators who connect their accounts see their own platform analytics instead.",
    source:
      "DemographicsPro, via Stream Hatchet (monthly). Claimed creators: the connected platform's own analytics.",
  },
  popular_games: {
    title: "Popular Games",
    body: "Games played in the last 30 days, ranked by time streamed. Time per game comes from Stream Hatchet's per-game stream data; a stream's watch time is shared between its games in proportion to the time spent on each.",
    source: `${SH_DAILY}. Creators Stream Hatchet doesn't cover: games seen in our own live readings, marked as observed.`,
  },
  viewer_count: {
    title: "Viewer Count",
    body: "The creator's average viewers on each day they streamed, on their main platform, with that day's peak. A day's data arrives the next morning (UTC), so today's stream shows up tomorrow.",
    source: `${SH_DAILY}, the same streams as Recent Streams. Creators Stream Hatchet doesn't cover: our own live readings every 6–24 hours, which can miss a stream's peak.`,
  },
  recent_streams: {
    title: "Recent Streams",
    body: "The creator's latest streams on every platform, with average and peak viewers per stream. A stream marked Processing has ended but its viewer numbers haven't arrived yet; they usually land the next morning (UTC).",
    source: `${SH_DAILY}. Twitch streams not in it yet come from Twitch's VOD list, without viewer numbers.`,
  },
  platform_breakdown: {
    title: "Platform Breakdown",
    body: "How the creator's followers split across platforms, using the latest count on each.",
    source: FOLLOWER_SOURCES,
  },
  brand_partners: {
    title: "Brand Partners",
    body: "Brands the creator has worked with.",
    source: "Added by the creator. Not verified by TwitchMetrics.",
  },
};

/** Column headers on the /creators list. */
export const CREATOR_LIST_INFO = {
  followers: {
    title: "Followers",
    body: "The creator's latest follower counts, added up across platforms. With a platform filter on, that platform's count only.",
    source: FOLLOWER_SOURCES,
  },
  trend: {
    title: "7d Trend",
    body: "Change in followers over the last 7 days, across platforms or, with a platform filter on, on that platform.",
    source: FOLLOWER_SOURCES,
  },
  airtime: {
    ...CREATOR_STATS_INFO.airtime,
    body: `${CREATOR_STATS_INFO.airtime.body} Last 30 whole days with complete data, same as the profile page.`,
  },
  avgAirtime: {
    ...CREATOR_STATS_INFO.avgAirtime,
    body: `${CREATOR_STATS_INFO.avgAirtime.body} Last 30 whole days with complete data.`,
  },
  peakViewers: {
    ...CREATOR_STATS_INFO.peakViewers,
    body: `${CREATOR_STATS_INFO.peakViewers.body} Last 30 whole days with complete data.`,
  },
  avgViewers: {
    ...CREATOR_STATS_INFO.avgViewers,
    body: `${CREATOR_STATS_INFO.avgViewers.body} Last 30 whole days with complete data.`,
  },
} satisfies Record<string, MetricInfo>;

const TWITCH_GAME_READING =
  "Twitch API, every 30 minutes: viewers added up across the game's live streams (the top 5,000 at most).";

export const GAME_INFO = {
  avgViewers7d: {
    title: "Avg Viewers · 7d",
    body: "Average number of people watching the game at any moment over the last 7 complete days, per platform. The total adds the platforms together. A stream that played several games counts equally toward each of them, so a game's figure is an estimate.",
    source: `Stream Hatchet's daily totals, which run a day or two behind, so each row names the days it covers. If Stream Hatchet has nothing for a platform: ${TWITCH_GAME_READING} Kick API, hourly.`,
  },
  peakViewers24h: {
    title: "Peak Viewers · 24h",
    body: "The highest reading in the last 24 hours, per platform. Readings are hourly or every 30 minutes, so a shorter spike between two readings isn't caught. There's no total: the platforms peak at different moments, so adding their peaks would count an audience that was never there at once. YouTube only shows a peak for games with Stream Hatchet live data.",
    source: `Stream Hatchet live data, hourly, for the biggest games. ${TWITCH_GAME_READING} Kick API, hourly (the top 100 channels per Kick category).`,
  },
  liveViewers: {
    title: "Live Viewers",
    body: "People watching the game right now, per platform, from each platform's latest reading (no older than 2 hours). When there's no recent YouTube reading, its row is the latest daily average, dated.",
    source: `Stream Hatchet live data, hourly, for the biggest games. Other games: ${TWITCH_GAME_READING} Kick API, hourly (the top 100 channels per Kick category). YouTube: Stream Hatchet's daily averages.`,
  },
  liveChannels: {
    title: "Live Channels",
    body: "Channels streaming the game right now, per platform, from each platform's latest reading (no older than 2 hours). When there's no recent YouTube reading, its row is a daily average of channels live at once, dated.",
    source:
      "Stream Hatchet live data, hourly, for the biggest games. Other games: Twitch API, every 30 minutes (the top 5,000 streams at most). Kick API, hourly (the top 100 channels per Kick category). YouTube: Stream Hatchet's daily averages.",
  },
  avgChannels7d: {
    title: "Avg Live Channels · 7d",
    body: "Average number of channels streaming the game at any moment over the last 7 days, per platform. The total adds the platforms together. Twitch counts stop at the top 5,000 streams and Kick counts at the top 100 channels per Kick category, so the biggest games read low.",
    source:
      "Twitch API, every 30 minutes. Kick API, hourly. YouTube: Stream Hatchet's daily averages.",
  },
  viewershipHistory: {
    title: "Twitch Viewership History",
    body: "Viewers watching the game on Twitch over time, one reading every 30 minutes. A spike shorter than that can fall between two readings, so peaks can look lower than in tools that measure more often. The average line comes from these readings, so it can differ from the Twitch figure in the header, which uses Stream Hatchet's daily totals. Kick and YouTube aren't in this chart.",
    source: TWITCH_GAME_READING,
  },
  activity: {
    title: "Twitch Viewership & Channel Activity",
    body: "Twitch viewers and the number of live Twitch channels for the game, side by side. Kick and YouTube aren't in this chart.",
    source: "Twitch API, every 30 minutes.",
  },
  mostWatched: {
    title: "Most Watched Channels",
    body: "Channels with the most hours watched on this game over the last 7 days with complete data (UTC), across Twitch, Kick and YouTube. A stream that played several games is split by the time spent on each, from Stream Hatchet's per-game data; its watch time is shared in the same proportions.",
    source: SH_DAILY,
  },
  emerging: {
    title: "Emerging Channels",
    body: "Twitch channels that went live in the last 12 hours, by current viewers, leaving out the six biggest live channels on the game right now. When there are fewer than five, the next-biggest live channels fill in.",
    source: "Twitch API, every 30 minutes.",
  },
  broadcastLanguages: {
    title: "Top Broadcast Languages",
    body: "Share of the game's live Twitch streams in each language. It counts streams, not viewers: one big English stream counts the same as one small one.",
    source:
      "Twitch API, every 30 minutes: the language each live stream is set to.",
  },
} satisfies Record<string, MetricInfo>;

/** An entry with the exact period it covers, e.g. "Sep 20 – Oct 19, 2026". */
export function withWindow(info: MetricInfo, window: string): MetricInfo {
  return { ...info, window };
}
