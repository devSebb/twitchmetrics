import { prisma } from "@twitchmetrics/database";
import { inngest } from "../../client";
import { createLogger } from "@/lib/logger";
import { cacheInvalidate } from "@/server/services/cache";
import {
  buildGameSearchText,
  extractDeveloper,
  extractPublisher,
  extractReleaseDate,
  formatIgdbCoverUrl,
  lookupIgdbGameById,
  searchIgdbGameByName,
} from "@/server/services/igdb";
import { executeIngestionRun } from "@/server/services/ingestion/runs";

const log = createLogger("enrich-games");
const IGDB_RATE_DELAY_MS = 260;
const ENRICH_BATCH_SIZE = 100;

function shouldReplaceCoverImage(
  currentUrl: string | null,
  nextUrl: string | null,
) {
  if (!nextUrl) return false;
  if (!currentUrl) return true;
  return currentUrl.includes("jtvnw.net");
}

export const enrichGames = inngest.createFunction(
  { id: "enrich-games", concurrency: { limit: 1 } },
  [{ cron: "30 5 * * *" }, { event: "games/enrich" }],
  async ({ step }) => {
    return executeIngestionRun(
      {
        domain: "game",
        scope: "enrichment",
        jobType: "enrich-games",
        platform: "igdb",
      },
      async () => {
        const games = await step.run(
          "load-games-needing-enrichment",
          async () => {
            return prisma.game.findMany({
              where: {
                OR: [
                  { summary: null },
                  { genres: { isEmpty: true } },
                  { developer: null },
                  { publisher: null },
                  { releaseDate: null },
                  { igdbId: null },
                ],
              },
              orderBy: { currentViewers: "desc" },
              take: ENRICH_BATCH_SIZE,
              select: {
                id: true,
                slug: true,
                name: true,
                igdbId: true,
                coverImageUrl: true,
                summary: true,
                genres: true,
                developer: true,
                publisher: true,
                releaseDate: true,
              },
            });
          },
        );

        const result = await step.run("enrich-games", async () => {
          let enriched = 0;
          let skipped = 0;
          let failed = 0;

          for (const game of games) {
            try {
              let igdbData = game.igdbId
                ? await lookupIgdbGameById(game.igdbId)
                : null;

              if (!igdbData) {
                igdbData = await searchIgdbGameByName(game.name);
              }

              await new Promise((resolve) =>
                setTimeout(resolve, IGDB_RATE_DELAY_MS),
              );

              if (!igdbData) {
                skipped++;
                continue;
              }

              const genres =
                igdbData.genres?.map((genre) => genre.name) ?? game.genres;
              const developer =
                extractDeveloper(igdbData.involved_companies) ?? game.developer;
              const publisher =
                extractPublisher(igdbData.involved_companies) ?? game.publisher;
              const igdbCover = formatIgdbCoverUrl(igdbData.cover?.url);

              const updateData = {
                ...(game.summary || !igdbData.summary
                  ? {}
                  : { summary: igdbData.summary }),
                ...(game.genres.length > 0 || genres.length === 0
                  ? {}
                  : { genres }),
                ...(game.developer || !developer ? {} : { developer }),
                ...(game.publisher || !publisher ? {} : { publisher }),
                ...(game.releaseDate || !igdbData.release_dates
                  ? {}
                  : {
                      releaseDate: extractReleaseDate(igdbData.release_dates),
                    }),
                ...(game.igdbId || !igdbData.id ? {} : { igdbId: igdbData.id }),
                ...(shouldReplaceCoverImage(game.coverImageUrl, igdbCover)
                  ? { coverImageUrl: igdbCover }
                  : {}),
                searchText: buildGameSearchText({
                  name: game.name,
                  developer,
                  publisher,
                  genres,
                }),
              };

              await prisma.game.update({
                where: { id: game.id },
                data: updateData,
              });

              try {
                await cacheInvalidate(`game:${game.slug}`);
                await cacheInvalidate(`game:${game.slug}:*`);
              } catch {
                // Non-blocking
              }

              enriched++;
            } catch (error) {
              failed++;
              log.warn(
                {
                  gameId: game.id,
                  slug: game.slug,
                  error: (error as Error).message,
                },
                "Game enrichment failed",
              );
            }
          }

          return {
            scanned: games.length,
            enriched,
            skipped,
            failed,
          };
        });

        log.info(result, "Game enrichment complete");
        return {
          result,
          summary: {
            recordsScanned: result.scanned,
            recordsWritten: result.enriched,
            recordsSkipped: result.skipped,
            recordsFailed: result.failed,
          },
        };
      },
      step,
    );
  },
);
