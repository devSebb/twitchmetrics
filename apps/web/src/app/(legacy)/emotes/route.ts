import { legacyGone } from "../_lib";

/**
 * The legacy "Every Twitch Emote" page has no equivalent here. 410 tells
 * Google it's intentionally gone; if Search Console later shows the query
 * demand was real, an emotes section is a candidate growth project.
 */
export function GET() {
  return legacyGone("The emote gallery");
}
