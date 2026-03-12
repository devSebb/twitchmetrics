import { z } from "zod";
import { UserRole } from "@twitchmetrics/database";
import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
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
    .input(z.object({ role: z.nativeEnum(UserRole) }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, name: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      }

      if (user.name && user.name.trim().length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Role can only be changed during onboarding.",
        });
      }

      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { role: input.role },
        select: { id: true, role: true },
      });
    }),

  completeOnboarding: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: input.name },
        select: { id: true, name: true, role: true },
      });
    }),
});
