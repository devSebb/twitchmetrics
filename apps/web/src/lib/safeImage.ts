const EXACT_ALLOWED_HOSTS = new Set([
  "static-cdn.jtvnw.net",
  "yt3.googleusercontent.com",
  "i.ytimg.com",
  "images.igdb.com",
  "avatars.githubusercontent.com",
]);

const ALLOWED_HOST_SUFFIXES = [
  ".jtvnw.net",
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
