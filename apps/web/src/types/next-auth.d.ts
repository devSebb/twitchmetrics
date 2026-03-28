import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      hasCompletedOnboarding: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
    hasCompletedOnboarding?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    hasCompletedOnboarding?: boolean;
  }
}
