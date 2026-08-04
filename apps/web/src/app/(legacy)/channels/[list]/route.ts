import { db } from "@/server/db";
import {
  LEGACY_CHANNEL_LISTS,
  resolveLegacyGameName,
} from "@/server/services/legacy-redirects";
import { legacyNotFound, legacyRedirect } from "../../_lib";

/**
 * Legacy ranking pages: /channels/<list>[?game=Name]. Game-filtered variants
 * go to the per-game creator ranking (/creators?sort=viewership&game=<slug>);
 * plain lists go to /creators views.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ list: string }> },
) {
  const { list } = await context.params;
  const destination = LEGACY_CHANNEL_LISTS[list];
  if (!destination) return legacyNotFound("this ranking");

  const game = new URL(request.url).searchParams.get("game");
  if (game) {
    const slug = await resolveLegacyGameName(db, game);
    if (slug) {
      return legacyRedirect(
        request.url,
        `/creators?sort=viewership&game=${encodeURIComponent(slug)}`,
      );
    }
  }

  return legacyRedirect(request.url, destination);
}
