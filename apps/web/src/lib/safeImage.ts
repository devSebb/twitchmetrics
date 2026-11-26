const EXACT_ALLOWED_HOSTS = new Set([
  "static-cdn.jtvnw.net",
  "yt3.googleusercontent.com",
  "i.ytimg.com",
  // Kick serves channel pictures from files.kick.com (65K listed creators).
  "files.kick.com",
  // Stream Hatchet's own picture host (Instagram and TikTok creators from the
  // social-profiles export) and X's. Neither expires.
  "d1hrk5gt3yn7pi.cloudfront.net",
  "pbs.twimg.com",
  "images.igdb.com",
  "avatars.githubusercontent.com",
]);

const ALLOWED_HOST_SUFFIXES = [
  ".jtvnw.net",
  // YouTube serves channel avatars from both googleusercontent.com and the
  // older ggpht.com CDN; the entire Stream Hatchet catalog uses yt3.ggpht.com.
  ".ggpht.com",
  ".googleusercontent.com",
  ".cdninstagram.com",
  ".fbcdn.net",
  ".r2.dev",
];

function isAllowedImageHost(hostname: string): boolean {
  if (EXACT_ALLOWED_HOSTS.has(hostname)) {
    return true;
  }

  return ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function getSafeImageSrc(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;

    return isAllowedImageHost(parsed.hostname) ? url : null;
  } catch {
    return null;
  }
}
