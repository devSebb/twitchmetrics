import { prisma } from "@twitchmetrics/database"
import { auth } from "@/lib/auth"

export async function createContext() {
  const session = await auth()

  return {
    prisma,
    session,
    user: session?.user
      ? { id: session.user.id, role: session.user.role }
      : null,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
