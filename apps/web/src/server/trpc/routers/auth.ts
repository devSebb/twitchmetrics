import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
import { logAudit } from "@/server/services/audit";
import { avatarUploadLimiter } from "@/lib/redis";
import {
  AVATAR_ALLOWED_TYPES,
  AVATAR_MAX_BYTES,
  canUserUploadAvatar,
  commitAvatar,
  isAllowedAvatarContentType,
  isKeyOwnedBy,
  presignAvatarUpload,
  removeAvatar,
} from "@/server/services/avatar";
import { isStorageConfigured } from "@/server/services/storage/r2";
import { protectedProcedure } from "../middleware";
import { router } from "../root";

export const authRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        hasCompletedOnboarding: true,
        createdAt: true,
      },
    });
  }),

  updateName: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: input.name },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          image: true,
          updatedAt: true,
        },
      });
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, passwordHash: true },
      });
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Password login is not enabled for this account.",
        });
      }

      const validCurrent = await compare(
        input.currentPassword,
        user.passwordHash,
      );
      if (!validCurrent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect.",
        });
      }

      const newHash = await hash(input.newPassword, 12);
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { passwordHash: newHash },
      });
      return { success: true };
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    logAudit({
      userId: ctx.user.id,
      action: "auth.deleteAccount",
    });

    const profile = await ctx.prisma.creatorProfile.findUnique({
      where: { userId: ctx.user.id },
      select: { id: true },
    });

    await ctx.prisma.$transaction(async (tx) => {
      if (profile) {
        await tx.creatorProfile.update({
          where: { id: profile.id },
          data: {
            userId: null,
            state: "unclaimed",
            claimedAt: null,
          },
        });
        await tx.platformAccount.updateMany({
          where: { creatorProfileId: profile.id },
          data: {
            accessToken: null,
            refreshToken: null,
            tokenExpiresAt: null,
            oauthScopes: [],
            isOAuthConnected: false,
            lastOAuthRefresh: null,
          },
        });
      }

      await tx.claimRequest.deleteMany({ where: { userId: ctx.user.id } });
      await tx.account.deleteMany({ where: { userId: ctx.user.id } });
      await tx.session.deleteMany({ where: { userId: ctx.user.id } });
      await tx.user.delete({ where: { id: ctx.user.id } });
    });

    return { success: true };
  }),

  updateRole: protectedProcedure
    .input(z.object({ role: z.enum(["creator", "talent_manager"]) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, hasCompletedOnboarding: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (user.hasCompletedOnboarding) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Role can only be changed during onboarding.",
        });
      }

      const updated = await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { role: input.role, roleSelectedAt: new Date() },
        select: { id: true, role: true },
      });

      logAudit({
        userId: ctx.user.id,
        action: "auth.updateRole",
        metadata: { newRole: input.role },
      });

      return updated;
    }),

  completeOnboarding: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(50),
        role: z.enum(["creator", "talent_manager"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.prisma.$transaction(async (tx) => {
        const updatedUser = await tx.user.update({
          where: { id: ctx.user.id },
          data: {
            name: input.name,
            role: input.role,
            roleSelectedAt: new Date(),
            hasCompletedOnboarding: true,
          },
          select: { id: true, name: true, role: true },
        });

        const existingProfile = await tx.creatorProfile.findUnique({
          where: { userId: ctx.user.id },
          select: { id: true },
        });

        if (input.role === "creator") {
          if (existingProfile) {
            await tx.creatorProfile.update({
              where: { id: existingProfile.id },
              data: {
                state: "claimed",
                displayName: input.name,
                claimedAt: new Date(),
              },
            });
          } else {
            await tx.creatorProfile.create({
              data: {
                userId: ctx.user.id,
                slug: `user-${ctx.user.id}`,
                displayName: input.name,
                primaryPlatform: "twitch",
                state: "claimed",
                claimedAt: new Date(),
              },
            });
          }
        } else {
          if (existingProfile) {
            // Clean up auto-created profile from OAuth signIn (e.g. talent managers)
            await tx.platformAccount.deleteMany({
              where: { creatorProfileId: existingProfile.id },
            });
            await tx.creatorProfile.delete({
              where: { id: existingProfile.id },
            });
          }
          // Seed an empty TM profile so the settings page has a row to edit.
          await tx.talentManagerProfile.upsert({
            where: { userId: ctx.user.id },
            create: { userId: ctx.user.id },
            update: {},
          });
        }

        return updatedUser;
      });

      logAudit({
        userId: ctx.user.id,
        action: "auth.completeOnboarding",
        metadata: { role: input.role },
      });

      return result;
    }),

  /**
   * Whether the calling user should see the avatar edit affordance. TMs
   * always can; creators only when they have zero connected platforms.
   */
  canEditAvatar: protectedProcedure.query(async ({ ctx }) => {
    if (!isStorageConfigured()) {
      return { canEdit: false };
    }
    const canEdit = await canUserUploadAvatar(ctx.user.id, ctx.user.role);
    return { canEdit };
  }),

  presignAvatarUpload: protectedProcedure
    .input(
      z.object({
        contentType: z.string(),
        sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isStorageConfigured()) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Avatar uploads are not configured.",
        });
      }

      if (!isAllowedAvatarContentType(input.contentType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported file type. Use one of: ${AVATAR_ALLOWED_TYPES.join(", ")}.`,
        });
      }

      const allowed = await canUserUploadAvatar(ctx.user.id, ctx.user.role);
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Avatar uploads are not available for this account.",
        });
      }

      // Advisory rate limit — fail open if Upstash is unreachable so a Redis
      // outage doesn't block a legitimate user from updating their avatar.
      try {
        const rate = await avatarUploadLimiter.limit(ctx.user.id);
        if (!rate.success) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many avatar uploads — try again later.",
          });
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.warn("[avatar] rate limiter unavailable, allowing upload", {
          userId: ctx.user.id,
          error,
        });
      }

      return presignAvatarUpload({
        userId: ctx.user.id,
        contentType: input.contentType,
        contentLength: input.sizeBytes,
      });
    }),

  commitAvatar: protectedProcedure
    .input(z.object({ key: z.string().min(1).max(256) }))
    .mutation(async ({ ctx, input }) => {
      if (!isKeyOwnedBy(input.key, ctx.user.id)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invalid key.",
        });
      }

      const result = await commitAvatar({
        userId: ctx.user.id,
        role: ctx.user.role,
        key: input.key,
      });

      logAudit({
        userId: ctx.user.id,
        action: "auth.commitAvatar",
        metadata: { key: input.key },
      });

      return result;
    }),

  removeAvatar: protectedProcedure.mutation(async ({ ctx }) => {
    await removeAvatar({ userId: ctx.user.id, role: ctx.user.role });

    logAudit({
      userId: ctx.user.id,
      action: "auth.removeAvatar",
    });

    return { ok: true };
  }),
});
