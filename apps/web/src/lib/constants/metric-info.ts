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
    source: `${SH_DAILY} (daily peak per channel), or our own Twitch / YouTube readings when they saw a higher one.`,
  },
  peakViewersCombined: {
    title: "Peak Viewers · estimated combined",
    body: "Highest platform peak in the period plus what the creator's other platforms averaged at that moment. An estimate: the data has one peak per channel per day, not a minute-by-minute series.",
    source: SH_DAILY,
  },
  avgViewers: {
    title: "Avg Viewers",
    body: "Average concurrent viewers while live: total minutes watched divided by airtime, across all platforms.",
    source: `${SH_DAILY}. Creators Stream Hatchet doesn't cover use the average of our own periodic platform readings.`,
  },
  newFollowers: {
    title: "New Followers",
    body: "Change in followers between the first and last reading in the period, added up across platforms.",
    source:
      "Platform APIs (Twitch, YouTube) and Stream Hatchet follower counts",
  },
} satisfies Record<string, MetricInfo>;

const FOLLOWER_SOURCES =
  "Twitch and YouTube APIs for channels we track closely; Stream Hatchet for every other channel (weekly for Twitch, YouTube and Kick, monthly for Instagram, TikTok and X).";

export const CREATOR_HEADER_INFO = {
  totalFollowers: {
    title: "Total Followers",
    body: "The latest follower count on each of the creator's platforms, added together. Someone who follows on two platforms counts twice.",
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
    body: "Games played in the last 30 days, ranked by time streamed. Stream data lists the games in each stream but not the minutes spent on each, so a stream's airtime and watch time are split equally across the games it played.",
    source: `${SH_DAILY}. Creators Stream Hatchet doesn't cover: games seen in our own live readings, marked as observed.`,
  },
  viewer_count: {
    title: "Viewer Count",
    body: "The creator's average viewers over time on the selected platform.",
    source:
      "Our own live readings of the creator's streams. Platforms we don't read live (most Kick channels) use Stream Hatchet's daily averages, one point per day streamed.",
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
  // The list doesn't say which kind of peak a row has, so this covers both.
  peakViewers: {
    ...CREATOR_STATS_INFO.peakViewers,
    body: "The highest audience in the period: the best single platform, or for a creator streaming on several platforms at once, an estimate of their combined peak. Last 30 whole days with complete data.",
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
    body: "Average number of people watching the game at any moment over the last 7 days, per platform. The total adds the platforms together.",
    source: `${TWITCH_GAME_READING} Kick API, hourly. YouTube: Stream Hatchet's daily averages, which run a day or two behind, so its row names the days it covers.`,
  },
  peakViewers24h: {
    title: "Peak Viewers · 24h",
    body: "The highest reading in the last 24 hours, per platform. There's no total: the platforms peak at different moments, so adding their peaks would count an audience that was never there at once. YouTube has no live feed, so it has no peak.",
    source: `${TWITCH_GAME_READING} Kick API, hourly.`,
  },
  liveViewers: {
    title: "Live Viewers",
    body: "People watching the game right now, per platform, from each platform's latest reading (no older than 2 hours). YouTube has no live feed: its row is the latest daily average, dated.",
    source: `${TWITCH_GAME_READING} Kick API, hourly. YouTube: Stream Hatchet's daily averages.`,
  },
  liveChannels: {
    title: "Live Channels",
    body: "Channels streaming the game right now, per platform, from each platform's latest reading. YouTube's row is a daily average of channels live at once, dated.",
    source:
      "Twitch API, every 30 minutes. Kick API, hourly. YouTube: Stream Hatchet's daily averages.",
  },
  avgChannels7d: {
    title: "Avg Live Channels · 7d",
    body: "Average number of channels streaming the game at any moment over the last 7 days, per platform. The total adds the platforms together.",
    source:
      "Twitch API, every 30 minutes. Kick API, hourly. YouTube: Stream Hatchet's daily averages.",
  },
  viewershipHistory: {
    title: "Twitch Viewership History",
    body: "Viewers watching the game on Twitch over time. The average line is weighted by time, the same way as the Twitch figure in the header. Kick and YouTube aren't in this chart.",
    source: TWITCH_GAME_READING,
  },
  activity: {
    title: "Twitch Viewership & Channel Activity",
    body: "Twitch viewers and the number of live Twitch channels for the game, side by side. Kick and YouTube aren't in this chart.",
    source: "Twitch API, every 30 minutes.",
  },
  mostWatched: {
    title: "Most Watched Channels",
    body: "Channels streaming the game right now, ranked by their current viewers. A channel drops off once its platform's reading is more than 1–2 hours old, so streams that ended hours ago don't linger.",
    source:
      "Twitch API (top 6, every 30 minutes) and Kick API (top 10, hourly), plus Stream Hatchet live data when this game is in its hourly rotation.",
  },
  emerging: {
    title: "Emerging Channels",
    body: "Twitch channels that went live in the last 12 hours and aren't already in Most Watched, by current viewers. When there are fewer than five, the next-biggest live channels fill in.",
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
