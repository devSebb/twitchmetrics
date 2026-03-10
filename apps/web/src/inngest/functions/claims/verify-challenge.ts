import { inngest } from "../../client"

// Event: "claim/verify-challenge"
// TODO: Poll platform API for challenge code in bio/post
// Retry with backoff for up to 30 minutes, then expire
export const verifyChallenge = inngest.createFunction(
  { id: "verify-challenge" },
  { event: "claim/verify-challenge" },
  async ({ event, step }) => {
    // TODO: implement
  },
)
