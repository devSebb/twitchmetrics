import { headers } from "next/headers";
import { prisma } from "@twitchmetrics/database";
import { getSession } from "@/server/auth-cache";

export async function createContext() {
  const [session, headerStore] = await Promise.all([getSession(), headers()]);

  return {
    prisma,
    session,
    headers: headerStore,
    user: session?.user
      ? { id: session.user.id, role: session.user.role }
      : null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
