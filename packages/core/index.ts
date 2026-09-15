// @twitchmetrics/core — domain code shared by apps/web and the root workers.
//
// Rules for everything in this package:
// - No `@/` imports (root workers cannot resolve the app alias).
// - No Next.js / React imports; pure TypeScript plus @twitchmetrics/database.
// - Functions that write take the db client as a parameter where a caller may
//   need a transaction or its own PrismaClient.

export * from "./src/tiers";
export * from "./src/creator-aggregates";
