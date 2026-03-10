import { router } from "../root"
import { authRouter } from "./auth"
import { creatorRouter } from "./creator"
import { platformRouter } from "./platform"
import { snapshotRouter } from "./snapshot"
import { claimRouter } from "./claim"
import { talentManagerRouter } from "./talentManager"
import { adminRouter } from "./admin"
import { gameRouter } from "./game"

export const appRouter = router({
  auth: authRouter,
  creator: creatorRouter,
  platform: platformRouter,
  snapshot: snapshotRouter,
  claim: claimRouter,
  talentManager: talentManagerRouter,
  admin: adminRouter,
  game: gameRouter,
})

export type AppRouter = typeof appRouter
