import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
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

  const hasCompletedOnboarding =
    (request.auth.user as { hasCompletedOnboarding?: boolean } | undefined)
      ?.hasCompletedOnboarding ?? false;

  // Onboarding guard: redirect to /onboarding if not completed
  if (pathname.startsWith("/dashboard") && !hasCompletedOnboarding) {
    return NextResponse.redirect(
      new URL("/onboarding", request.nextUrl.origin),
    );
  }

  // If already onboarded and hitting /onboarding, redirect to dashboard
  if (pathname === "/onboarding" && hasCompletedOnboarding) {
    return NextResponse.redirect(
      new URL("/dashboard/home", request.nextUrl.origin),
    );
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

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding",
    "/home",
    "/analytics",
    "/claim",
    "/connections",
    "/media-kit",
    "/brand-partnerships",
    "/settings/:path*",
    "/roster/:path*",
    "/talent-manager/:path*",
    "/manage-creators/:path*",
    "/claims/:path*",
    "/api/claims/:path*",
    "/api/user/:path*",
  ],
};
