import type { NextAuthConfig } from "next-auth";

/**
 * Minimal edge-compatible auth config — no Prisma, no bcryptjs, no heavy adapters.
 * Used exclusively by middleware.ts to verify JWT tokens at the Edge.
 * The full auth config (with Prisma adapter, providers, callbacks) lives in auth.ts.
 */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt" as const },
  callbacks: {
    jwt({ token }) {
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role)
        (session.user as unknown as Record<string, unknown>).role = token.role;
      if (token.suspended !== undefined)
        (session.user as unknown as Record<string, unknown>).suspended =
          token.suspended;
      (
        session.user as unknown as Record<string, unknown>
      ).hasCompletedOnboarding = token.hasCompletedOnboarding ?? false;
      return session;
    },
  },
} satisfies NextAuthConfig;
