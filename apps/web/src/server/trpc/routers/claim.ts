import { ClaimMethod, Platform } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { inngest } from "@/inngest/client";
import { verifyBioChallenge } from "@/server/services/bio-verification";
import {
  approveClaimRequest,
  initiateClaim,
  rejectClaimRequest,
} from "@/server/services/claiming";
import { validateClaimAttempt } from "@/server/services/claim-guards";
import { adminProcedure, protectedProcedure } from "../middleware";
import { router } from "../root";

function attemptsRemainingFromNotes(notes: string | null): number | null {
  if (!notes) return null;
  const match = notes.match(/bio_attempts:(\d+)/);
  if (!match?.[1]) return null;
  const attempts = Number.parseInt(match[1], 10);
  if (!Number.isFinite(attempts)) return null;
  return Math.max(0, 3 - attempts);
}

export const claimRouter = router({
  initiate: protectedProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        method: z.nativeEnum(ClaimMethod),
        platform: z.nativeEnum(Platform),
        evidenceUrls: z.array(z.string().url()).max(5).optional(),
        clientIp: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const guard = await validateClaimAttempt(
        ctx.user.id,
        input.creatorProfileId,
        input.method,
        input.clientIp ?? "unknown",
      );
      if (!guard.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: guard.reason,
        });
      }

      const result = await initiateClaim({
        userId: ctx.user.id,
        creatorProfileId: input.creatorProfileId,
        method: input.method,
        platform: input.platform,
        ...(input.evidenceUrls ? { evidenceUrls: input.evidenceUrls } : {}),
      });

      if (result.status !== "rejected") {
        await inngest.send({
          name: "claim/initiated",
          data: {
            claimRequestId: result.claimRequestId,
            method: input.method,
          },
        });
      }

      return result;
    }),

  verifyBio: protectedProcedure
    .input(z.object({ claimRequestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const claimRequest = await ctx.prisma.claimRequest.findUnique({
        where: { id: input.claimRequestId },
        select: { id: true, userId: true },
      });

      if (!claimRequest || claimRequest.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return verifyBioChallenge(input.claimRequestId);
    }),

  getStatus: protectedProcedure
    .input(z.object({ creatorProfileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const latestClaim = await ctx.prisma.claimRequest.findFirst({
        where: {
          creatorProfileId: input.creatorProfileId,
          userId: ctx.user.id,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!latestClaim) {
        return null;
      }

      return {
        id: latestClaim.id,
        status: latestClaim.status,
        method: latestClaim.method,
        challengeCode: latestClaim.challengeCode,
        attemptsRemaining: attemptsRemainingFromNotes(latestClaim.reviewNotes),
        challengeExpiresAt:
          latestClaim.challengeExpiresAt?.toISOString() ?? null,
      };
    }),

  myClaims: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.claimRequest.findMany({
      where: { userId: ctx.user.id },
      include: {
        creatorProfile: {
          select: {
            id: true,
            displayName: true,
            slug: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  listPending: adminProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const skip = (input.page - 1) * input.limit;

      const [items, total] = await Promise.all([
        ctx.prisma.claimRequest.findMany({
          where: {
            status: "pending",
            method: "manual_review",
          },
          include: {
            creatorProfile: {
              select: {
                id: true,
                displayName: true,
                slug: true,
                avatarUrl: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          skip,
          take: input.limit,
        }),
        ctx.prisma.claimRequest.count({
          where: { status: "pending", method: "manual_review" },
        }),
      ]);

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
      };
    }),

  approve: adminProcedure
    .input(
      z.object({
        claimRequestId: z.string().uuid(),
        reviewNotes: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.claimRequest.update({
        where: { id: input.claimRequestId },
        data: {
          reviewNotes: input.reviewNotes ?? null,
        },
      });
      await approveClaimRequest(input.claimRequestId, ctx.user.id);
      return { success: true };
    }),

  reject: adminProcedure
    .input(
      z.object({
        claimRequestId: z.string().uuid(),
        reviewNotes: z.string().max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await rejectClaimRequest(
        input.claimRequestId,
        ctx.user.id,
        input.reviewNotes,
        "rejected",
      );
      return { success: true };
    }),
});
