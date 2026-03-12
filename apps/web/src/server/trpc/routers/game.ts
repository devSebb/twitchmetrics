import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../root";

export const gameRouter = router({
  getGame: publicProcedure
    .input(z.object({ slug: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.prisma.game.findUnique({
        where: { slug: input.slug },
      });

      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Game not found." });
      }

      return game;
    }),

  listGames: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        genre: z.string().optional(),
        sort: z
          .enum(["viewers", "channels", "hoursWatched", "name"])
          .default("viewers"),
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const where: Record<string, unknown> = {};
      if (input.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { slug: { contains: input.search, mode: "insensitive" } },
        ];
      }
      if (input.genre) {
        where.genres = { has: input.genre };
      }

      const orderByMap = {
        viewers: { currentViewers: "desc" as const },
        channels: { currentChannels: "desc" as const },
        hoursWatched: { hoursWatched7d: "desc" as const },
        name: { name: "asc" as const },
      };

      const [items, total] = await Promise.all([
        ctx.prisma.game.findMany({
          where,
          orderBy: orderByMap[input.sort],
          skip,
          take: input.limit,
        }),
        ctx.prisma.game.count({ where }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        hasMore: skip + items.length < total,
      };
    }),

  getGameViewerHistory: publicProcedure
    .input(
      z.object({
        gameId: z.string().uuid(),
        period: z.enum(["24h", "7d", "30d"]).default("7d"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const periodMap: Record<string, number> = {
        "24h": 1,
        "7d": 7,
        "30d": 30,
      };
      const days = periodMap[input.period]!;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      return ctx.prisma.gameViewerSnapshot.findMany({
        where: {
          gameId: input.gameId,
          snapshotAt: { gte: since },
        },
        orderBy: { snapshotAt: "asc" },
      });
    }),

  getTopGames: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.game.findMany({
        orderBy: { currentViewers: "desc" },
        take: input.limit,
        select: {
          id: true,
          name: true,
          slug: true,
          coverImageUrl: true,
          currentViewers: true,
          currentChannels: true,
          peakViewers24h: true,
          hoursWatched7d: true,
          genres: true,
        },
      });
    }),
});
