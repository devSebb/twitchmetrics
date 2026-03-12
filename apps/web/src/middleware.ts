import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((request) => {
  if (request.auth) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const returnTo = `${pathname}${search}`;
  const loginUrl = new URL("/login", request.nextUrl.origin);
  loginUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: [
    "/dashboard/:path*",
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
