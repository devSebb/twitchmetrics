import { NextResponse } from "next/server";
import { Platform } from "@twitchmetrics/database";
import { parsePagination } from "@/app/api/_lib/pagination";
import { rateLimitOrResponse } from "@/app/api/_lib/rateLimit";
import { resolveGameFilter } from "@/server/services/creator-ranking";
import {
  listPublicCreators,
  type CreatorListSort,
} from "@/server/services/creator-list";

const VALID_PLATFORMS = new Set<Platform>([
  "twitch",
  "youtube",
  "instagram",
  "tiktok",
  "x",
  "kick",
]);

const VALID_SORTS = new Set<CreatorListSort>([
  "followers",
  "viewership",
  "peak",
  "trending",
  "recent",
]);

function parsePlatform(value: string | null): Platform | null {
  if (!value) return null;
  if (!VALID_PLATFORMS.has(value as Platform)) return null;
  return value as Platform;
}

function parseSort(value: string | null): CreatorListSort {
  if (!value) return "followers";
  return VALID_SORTS.has(value as CreatorListSort)
    ? (value as CreatorListSort)
    : "followers";
}

/**
 * Thin wrapper over services/creator-list — the query, the ranking and the
 * Redis caching all live there so this route and the /creators server render
 * cannot drift apart again (they had: see the note in creator-list.ts).
 */
export async function GET(request: Request) {
  const rateLimited = await rateLimitOrResponse(request, "creators", {
    limit: 120,
    window: "60 s",
  });
  if (rateLimited) return rateLimited;

  const { searchParams } = new URL(request.url);
  const { page, limit } = parsePagination(searchParams);

  // Unknown game slugs are ignored (filter dropped), matching /creators.
  const game = await resolveGameFilter(searchParams.get("game"));

  const result = await listPublicCreators({
    page,
    limit,
    sort: parseSort(searchParams.get("sort")),
    platform: parsePlatform(searchParams.get("platform")),
    game,
    query: searchParams.get("q")?.trim() || null,
    view: searchParams.get("view") === "list" ? "list" : "grid",
  });

  return NextResponse.json(result);
}
