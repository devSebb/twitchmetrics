import { db } from "@/server/db";
import {
  LEGACY_CHANNEL_LISTS,
  resolveLegacyGameName,
} from "@/server/services/legacy-redirects";
import { gameRankingPath } from "@/lib/rankings";
import { hasGameRanking } from "@/server/services/rankings";
import { legacyNotFound, legacyRedirect } from "../../_lib";

/**
 * Legacy ranking pages: /channels/<list>[?game=Name]. Plain lists go to the
 * matching Twitch ranking. Game-filtered variants go to that game's ranking
 * (/rankings/game/<slug>) when one is published, and to the game-filtered
 * channel list otherwise (only the most watched games have a ranking).
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
      const ranked = await hasGameRanking(slug).catch(() => false);
      return legacyRedirect(
        request.url,
        ranked
          ? gameRankingPath(slug)
          : `/creators?sort=viewership&game=${encodeURIComponent(slug)}`,
      );
    }
  }

  return legacyRedirect(request.url, destination);
}
