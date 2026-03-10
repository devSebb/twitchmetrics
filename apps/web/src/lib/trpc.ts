"use client"

import { createTRPCReact, httpBatchLink } from "@trpc/react-query"
import superjson from "superjson"
import type { AppRouter } from "@/server/trpc/routers"

export const trpc = createTRPCReact<AppRouter>()

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
      }),
    ],
  })
}
