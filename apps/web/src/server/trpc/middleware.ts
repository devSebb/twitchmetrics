import { TRPCError } from "@trpc/server"
import { middleware, publicProcedure } from "./root"

const isAuthenticated = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

const isCreator = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "creator") {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

const isTalentManager = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "talent_manager") {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== "admin") {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, user: ctx.user } })
})

export const protectedProcedure = publicProcedure.use(isAuthenticated)
export const creatorProcedure = publicProcedure.use(isCreator)
export const talentManagerProcedure = publicProcedure.use(isTalentManager)
export const adminProcedure = publicProcedure.use(isAdmin)
