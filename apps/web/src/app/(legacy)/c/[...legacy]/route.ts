import { db } from "@/server/db";
import { resolveLegacyChannel } from "@/server/services/legacy-redirects";
import { legacyNotFound, legacyRedirect } from "../../_lib";

/**
 * Legacy channel pages: /c/<twitchID>-<login> plus the old sub-tabs
 * (/streams, /videos, /clips, /emotes), which all consolidate into the
 * creator profile.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ legacy: string[] }> },
) {
  const { legacy } = await context.params;
  const segment = legacy[0];

  if (segment) {
    const slug = await resolveLegacyChannel(db, decodeURIComponent(segment));
    if (slug) {
      return legacyRedirect(request.url, `/creator/${slug}`);
    }
  }

  return legacyNotFound("this channel");
}
