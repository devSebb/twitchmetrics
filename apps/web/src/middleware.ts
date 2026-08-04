import NextAuth from "next-auth";
import { type NextRequest, NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

/* ------------------------------------------------------------------ */
/*  Site-wide password gate (Basic Auth)                               */
/*  Set SITE_PASSWORD env var to enable. Unset to disable.             */
/* ------------------------------------------------------------------ */

const SITE_PASSWORD = process.env.SITE_PASSWORD;

/** Paths that must NEVER be blocked by the password gate. */
function isPasswordExempt(pathname: string): boolean {
  // OAuth callbacks & Auth.js internals — blocking these breaks login
  if (pathname.startsWith("/api/auth/")) return true;
  // Inngest endpoint
  if (pathname.startsWith("/api/inngest")) return true;
  // Webhooks (Twitch EventSub, Kick, etc.)
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

function checkBasicAuth(request: NextRequest): NextResponse | null {
  if (!SITE_PASSWORD) return null; // gate disabled
  if (isPasswordExempt(request.nextUrl.pathname)) return null;

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      // Accept any username, only password matters
      const password = decoded.includes(":")
        ? decoded.slice(decoded.indexOf(":") + 1)
        : decoded;
      if (password === SITE_PASSWORD) return null; // authenticated
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TwitchMetrics", charset="UTF-8"',
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Auth.js session middleware (unchanged logic, runs after gate)       */
/* ------------------------------------------------------------------ */

/** Routes that require a valid session (Auth.js). */
const SESSION_PROTECTED = [
  "/dashboard",
  "/onboarding",
  "/home",
  "/analytics",
  "/claim",
  "/connections",
  "/media-kit",
  "/brand-partnerships",
  "/roster",
  "/talent-manager",
  "/manage-creators",
  "/claims",
  "/api/claims",
  "/api/user",
];

function needsSessionAuth(pathname: string): boolean {
  return SESSION_PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

const sessionAuth = auth((request) => {
  const { pathname } = request.nextUrl;

  if (!request.auth) {
    const { search } = request.nextUrl;
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const returnTo = `${pathname}${search}`;
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("returnTo", returnTo);
    return NextResponse.redirect(loginUrl);
  }

  // Admin route protection at Edge level
  if (pathname.startsWith("/dashboard/admin")) {
    const role = (request.auth.user as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      return NextResponse.redirect(
        new URL("/dashboard/home", request.nextUrl.origin),
      );
    }
  }

  return NextResponse.next();
});

/* ------------------------------------------------------------------ */
/*  Combined middleware                                                */
/* ------------------------------------------------------------------ */

export async function middleware(request: NextRequest) {
  // 1. Site-wide password gate
  const blocked = checkBasicAuth(request);
  if (blocked) return blocked;

  // 2. Sitemap index: /sitemap.xml is claimed by app/sitemap.ts (Next metadata
  //    route, which only serves the /sitemap/<id>.xml chunks), so the
  //    <sitemapindex> handler lives at /sitemap-index.xml. Rewrite so the
  //    canonical URL advertised in robots.txt serves the index.
  if (request.nextUrl.pathname === "/sitemap.xml") {
    return NextResponse.rewrite(new URL("/sitemap-index.xml", request.url));
  }

  // 3. Session-protected routes only
  if (needsSessionAuth(request.nextUrl.pathname)) {
    return sessionAuth(request, {} as never);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT static files and Next.js internals.
     * This lets the password gate cover the whole site.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|css|js|map)).*)",
  ],
};
