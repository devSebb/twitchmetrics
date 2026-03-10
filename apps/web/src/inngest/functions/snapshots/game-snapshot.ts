import { inngest } from "../../client"

// Cron: every 30 minutes
// TODO: Fetch Twitch top games (Get Top Games endpoint),
//   match to Game records, write GameViewerSnapshot,
//   update Game.currentViewers, currentChannels, peakViewers24h
export const gameSnapshot = inngest.createFunction(
  { id: "game-snapshot" },
  { cron: "*/30 * * * *" },
  async ({ step }) => {
    // TODO: implement
  },
)
