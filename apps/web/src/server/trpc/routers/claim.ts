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
import { logAudit } from "@/server/services/audit";
import {
  adminProcedure,
  creatorProcedure,
  protectedProcedure,
} from "../middleware";
import { router } from "../root";

function attemptsRemainingFromNotes(notes: string | null): number | null {
  if (!notes) return null;
  const match = notes.match(/bio_attempts:(\d+)/);
  if (!match?.[1]) return null;
  const attempts = Number.parseInt(match[1], 10);
  if (!Number.isFinite(attempts)) return null;
  return Math.max(0, 3 - attempts);
}

function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export const claimRouter = router({
  initiate: protectedProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        method: z.nativeEnum(ClaimMethod),
        platform: z.nativeEnum(Platform),
        evidenceUrls: z.array(z.string().url()).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const clientIp = extractClientIp(ctx.headers);

      const guard = await validateClaimAttempt(
        ctx.user.id,
        input.creatorProfileId,
        input.method,
        clientIp,
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
        select: { id: true, userId: true, updatedAt: true },
      });

      if (!claimRequest || claimRequest.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const secondsSinceUpdate =
        (Date.now() - claimRequest.updatedAt.getTime()) / 1000;
      if (secondsSinceUpdate < 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Please wait before trying again",
        });
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

  checkConnection: protectedProcedure
    .input(z.object({ creatorProfileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.creatorProfile.findUnique({
        where: { id: input.creatorProfileId },
        select: {
          primaryPlatform: true,
          platformAccounts: {
            select: { platformUserId: true, platform: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!profile) {
        return {
          connected: false,
          matches: false,
          platform: null,
          provider: null,
        };
      }

      const providerByPlatform: Partial<Record<Platform, string>> = {
        twitch: "twitch",
        youtube: "google",
        x: "twitter",
        instagram: "instagram",
        tiktok: "tiktok",
      };

      const platform = profile.primaryPlatform;
      const provider = providerByPlatform[platform] ?? null;

      if (!provider) {
        return { connected: false, matches: false, platform, provider: null };
      }

      const account = await ctx.prisma.account.findFirst({
        where: { userId: ctx.user.id, provider },
        select: { providerAccountId: true },
        orderBy: { id: "desc" },
      });

      if (!account?.providerAccountId) {
        return { connected: false, matches: false, platform, provider };
      }

      const primaryPlatformAccount = profile.platformAccounts.find(
        (pa) => pa.platform === platform,
      );

      const matches =
        !!primaryPlatformAccount &&
        primaryPlatformAccount.platformUserId === account.providerAccountId;

      return { connected: true, matches, platform, provider };
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

  /**
   * Self-register a Twitch channel when no pre-discovered profile exists.
   *
   * Looks up the Twitch user by login, populates the creator's existing
   * placeholder profile with real data, and fires an immediate snapshot so
   * the dashboard shows real stats right away.
   *
   * Returns { slug } on success, or { redirect: profileId } when an unclaimed
   * pre-discovered profile already exists for that channel (caller should
   * redirect to the standard claim flow for that profile).
   */
  selfRegister: creatorProcedure
    .input(
      z.object({
        twitchLogin: z
          .string()
          .min(1)
          .max(25)
          .regex(/^[a-zA-Z0-9_]+$/, "Invalid Twitch username"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const login = input.twitchLogin.toLowerCase();

      // Rate limit: max 3 selfRegister attempts per hour per user.
      // We count recent manual_review ClaimRequests as a simple proxy
      // (no schema change needed — selfRegister is conceptually similar).
      const recentAttempts = await ctx.prisma.claimRequest.count({
        where: {
          userId,
          method: "manual_review",
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
      });
      if (recentAttempts >= 3) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Too many registration attempts. Please try again later.",
        });
      }

      // Guard: user must not already have a real (non-placeholder) Twitch account.
      const existingTwitchAccount = await ctx.prisma.platformAccount.findFirst({
        where: { creatorProfile: { userId }, platform: "twitch" },
        select: { platformUserId: true, platformUsername: true },
      });
      if (
        existingTwitchAccount &&
        !/^\d+$/.test(existingTwitchAccount.platformUserId)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a Twitch channel registered.",
        });
      }

      // Look up the Twitch user — errors if the channel doesn't exist.
      const { twitchAdapter } = await import("@/server/adapters/twitch");
      let twitchProfile;
      try {
        twitchProfile = await twitchAdapter.fetchProfile(login);
      } catch {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Twitch channel "${login}" not found. Check the username and try again.`,
        });
      }

      const { platformUserId, platformDisplayName, platformAvatarUrl, bio } =
        twitchProfile;

      // Guard: another user has already claimed this platformUserId.
      const conflictAccount = await ctx.prisma.platformAccount.findUnique({
        where: {
          platform_platformUserId: { platform: "twitch", platformUserId },
        },
        select: {
          id: true,
          creatorProfile: {
            select: { id: true, userId: true, slug: true },
          },
        },
      });

      if (conflictAccount) {
        const ownerUserId = conflictAccount.creatorProfile.userId;
        if (ownerUserId && ownerUserId !== userId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "This Twitch channel is already claimed by another account.",
          });
        }
        if (!ownerUserId) {
          // Pre-discovered unclaimed profile — redirect to the standard claim flow.
          return { redirect: conflictAccount.creatorProfile.id } as {
            redirect: string;
            slug?: never;
          };
        }
      }

      // Fetch the creator's existing placeholder profile (created during onboarding).
      const creatorProfile = await ctx.prisma.creatorProfile.findUnique({
        where: { userId },
        select: { id: true, slug: true },
      });
      if (!creatorProfile) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      // Determine the new slug: prefer the Twitch login if it's not taken.
      const slugTaken = await ctx.prisma.creatorProfile.findFirst({
        where: { slug: login, NOT: { userId } },
        select: { id: true },
      });
      const newSlug = slugTaken ? creatorProfile.slug : login;

      // Populate the profile with real Twitch data.
      await ctx.prisma.creatorProfile.update({
        where: { id: creatorProfile.id },
        data: {
          ...(platformDisplayName ? { displayName: platformDisplayName } : {}),
          ...(platformAvatarUrl ? { avatarUrl: platformAvatarUrl } : {}),
          ...(bio ? { bio } : {}),
          slug: newSlug,
          primaryPlatform: "twitch",
        },
      });

      // Upsert the PlatformAccount with real data.
      const platformAccount = await ctx.prisma.platformAccount.upsert({
        where: {
          platform_platformUserId: { platform: "twitch", platformUserId },
        },
        create: {
          creatorProfileId: creatorProfile.id,
          platform: "twitch",
          platformUserId,
          platformUsername: login,
          ...(platformDisplayName ? { platformDisplayName } : {}),
          isOAuthConnected: false,
        },
        update: {
          creatorProfileId: creatorProfile.id,
          platformUsername: login,
          ...(platformDisplayName ? { platformDisplayName } : {}),
        },
      });

      // Trigger an immediate snapshot so the dashboard shows real data right away.
      try {
        void inngest.send({
          name: "creator/platform.connected",
          data: {
            creatorProfileId: creatorProfile.id,
            platform: "twitch" as Platform,
            platformUserId,
            platformAccountId: platformAccount.id,
          },
        });
      } catch {
        // Non-blocking
      }

      return { slug: newSlug } as { slug: string; redirect?: never };
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

      logAudit({
        userId: ctx.user.id,
        action: "claim.approve",
        targetType: "ClaimRequest",
        targetId: input.claimRequestId,
        metadata: { reviewNotes: input.reviewNotes },
      });

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

      logAudit({
        userId: ctx.user.id,
        action: "claim.reject",
        targetType: "ClaimRequest",
        targetId: input.claimRequestId,
        metadata: { reviewNotes: input.reviewNotes },
      });

      return { success: true };
    }),
});
