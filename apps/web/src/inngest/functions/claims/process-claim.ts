import { inngest } from "../../client"

// Event: "claim/initiated"
// TODO: Based on ClaimMethod, either:
//   - oauth: verify platformUserId match → auto-approve
//   - cross_platform: check cross-links → approve or fallback
//   - bio_challenge: generate code, start polling timer
//   - manual_review: queue for admin
export const processClaim = inngest.createFunction(
  { id: "process-claim" },
  { event: "claim/initiated" },
  async ({ event, step }) => {
    // TODO: implement
  },
)
