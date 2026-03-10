import { prisma } from "@twitchmetrics/database"

// Re-export the singleton Prisma client from the shared database package.
// All server-side DB access in the web app should import from here.
export const db = prisma
export default db
