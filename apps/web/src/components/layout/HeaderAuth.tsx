"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { HeaderUserMenu } from "./HeaderUserMenu";
import { MobileNavigation } from "./MobileNavigation";

type HeaderUser = {
  name: string | null;
  role: string;
  image: string | null;
  hasCreatorProfile: boolean;
};

// One fetch per document load — the promise is shared across remounts and
// route changes so the header never re-asks for the session while navigating.
let sessionPromise: Promise<HeaderUser | null> | null = null;

function fetchHeaderUser(): Promise<HeaderUser | null> {
  sessionPromise ??= fetch("/api/header-session", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { user: null }))
    .then((data: { user: HeaderUser | null }) => data.user)
    .catch(() => null);
  return sessionPromise;
}

/**
 * Auth-dependent header chrome. The session is fetched client-side so public
 * pages can render statically — reading it during the server render would
 * force every page in the (public) tree dynamic.
 */
export function HeaderAuth() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; user: HeaderUser | null }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchHeaderUser().then((user) => {
      if (!cancelled) setState({ status: "ready", user });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const user = state.status === "ready" ? state.user : null;

  return (
    <>
      {/* Keep compact authenticated controls available on mobile. Signed-out
          actions move into the drawer at the narrowest breakpoint. */}
      <div
        className={
          user ? "flex items-center gap-1" : "hidden items-center gap-2 sm:flex"
        }
      >
        {user ? (
          <>
            <NotificationBell
              userRole={user.role}
              hasCreatorProfile={user.hasCreatorProfile}
            />
            <HeaderUserMenu name={user.name} image={user.image} />
          </>
        ) : state.status === "ready" ? (
          <>
            <Link
              href="/login"
              className="n-button !px-3 text-n-slate hover:text-n-ink"
            >
              Log in
            </Link>
            <Link href="/register" className="n-button n-button-primary !px-5">
              Get started
            </Link>
          </>
        ) : null}
      </div>

      <MobileNavigation
        user={user ? { name: user.name, image: user.image } : null}
      />
    </>
  );
}
