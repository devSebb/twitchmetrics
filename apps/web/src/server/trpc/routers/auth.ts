import { z } from "zod";
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
});
