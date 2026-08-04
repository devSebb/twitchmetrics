import { db } from "@/server/db";
import { resolveLegacyGame } from "@/server/services/legacy-redirects";
import { legacyNotFound, legacyRedirect } from "../../_lib";

/** Legacy game pages: /g/<twitchGameID>-<slug>. */
export async function GET(
  request: Request,
  context: { params: Promise<{ legacy: string[] }> },
) {
  const { legacy } = await context.params;
  const segment = legacy[0];

  if (segment) {
    const slug = await resolveLegacyGame(db, decodeURIComponent(segment));
    if (slug) {
      return legacyRedirect(request.url, `/game/${slug}`);
    }
  }

  return legacyNotFound("this game");
}
