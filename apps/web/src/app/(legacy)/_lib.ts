import { NextResponse } from "next/server";
import { LEGACY_REDIRECT_CACHE_CONTROL } from "@/server/services/legacy-redirects";

/** 301 to a same-origin destination, CDN-cacheable. */
export function legacyRedirect(requestUrl: string, destination: string) {
  return NextResponse.redirect(new URL(destination, requestUrl), {
    status: 301,
    headers: { "Cache-Control": LEGACY_REDIRECT_CACHE_CONTROL },
  });
}

function errorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | TwitchMetrics</title></head>
<body style="font-family:system-ui,sans-serif;background:#1E1F22;color:#DBDEE1;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<main style="text-align:center;padding:2rem;max-width:28rem">
<h1 style="color:#F2F3F5">${title}</h1>
<p>${message}</p>
<p><a href="/creators" style="color:#E32C19">Browse top creators</a> · <a href="/search" style="color:#E32C19">Search</a></p>
</main>
</body>
</html>`;
}

/**
 * Honest 404 for legacy URLs we cannot map. Never blanket-redirect these to
 * the homepage — Google treats that as a soft-404 and it wastes crawl budget.
 */
export function legacyNotFound(subject: string) {
  return new NextResponse(
    errorPage(
      "Not Found",
      `We couldn't find ${subject} in our catalog. It may no longer be tracked.`,
    ),
    {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": LEGACY_REDIRECT_CACHE_CONTROL,
      },
    },
  );
}

/** 410 for legacy page types that have no equivalent on the new platform. */
export function legacyGone(subject: string) {
  return new NextResponse(
    errorPage("Page Retired", `${subject} is no longer part of TwitchMetrics.`),
    {
      status: 410,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": LEGACY_REDIRECT_CACHE_CONTROL,
      },
    },
  );
}
