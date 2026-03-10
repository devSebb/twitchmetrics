import { inngest } from "../../client"

// Cron: every 12 hours
// TODO: Find PlatformAccounts with tokenExpiresAt < now + 1 hour
// Refresh OAuth tokens for each platform's refresh flow
// Update encrypted accessToken, refreshToken, tokenExpiresAt
export const refreshTokens = inngest.createFunction(
  { id: "refresh-tokens" },
  { cron: "0 */12 * * *" },
  async ({ step }) => {
    // TODO: implement
  },
)
