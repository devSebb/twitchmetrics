"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell } from "@phosphor-icons/react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { getSafeImageSrc } from "@/lib/safeImage";

type NotificationBellProps = {
  userRole: string;
  hasCreatorProfile: boolean;
};

const POLL_INTERVAL_MS = 60_000;

export function NotificationBell({
  userRole,
  hasCreatorProfile,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Admin claims (preserves existing DashboardNavbar:47-51 behavior).
  const adminClaimsQuery = trpc.claim.listPending.useQuery(
    { page: 1, limit: 1 },
    {
      enabled: userRole === "admin",
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  );

  // Creator roster invites — only enabled when the user owns a creator profile.
  const inviteQuery = trpc.rosterInvite.listForCurrentUser.useQuery(undefined, {
    enabled: hasCreatorProfile,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const adminCount = adminClaimsQuery.data?.total ?? 0;
  const invites = inviteQuery.data ?? [];
  const inviteCount = invites.length;
  const totalCount = adminCount + inviteCount;

  // Outside-click close (same pattern as DashboardNavbar:54-65).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const acceptMutation = trpc.rosterInvite.accept.useMutation({
    onSuccess: async () => {
      await utils.rosterInvite.listForCurrentUser.invalidate();
    },
  });

  const declineMutation = trpc.rosterInvite.decline.useMutation({
    onSuccess: async () => {
      await utils.rosterInvite.listForCurrentUser.invalidate();
    },
  });

  // Hidden entirely when there's nothing to show across roles.
  const hasAnyContent =
    userRole === "admin" || hasCreatorProfile || totalCount > 0;
  if (!hasAnyContent) return null;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${totalCount > 0 ? ` (${totalCount})` : ""}`}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md p-2 text-n-slate transition-colors hover:text-n-ink"
      >
        <Bell size={20} weight="duotone" />
        {totalCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-n-red px-1 text-[9px] font-bold text-white">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-lg border border-n-line bg-n-canvas shadow-xl">
          <div className="border-b border-n-line px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-n-ink">
              Notifications
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* Roster invitations section */}
            {inviteCount > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-n-slate">
                  Roster invitations
                </p>
                {invites.map((invite) => {
                  const avatarSrc = invite.manager.avatarUrl
                    ? getSafeImageSrc(invite.manager.avatarUrl)
                    : null;
                  return (
                    <div
                      key={invite.accessId}
                      className="border-b border-n-surface px-4 py-3 last:border-b-0"
                    >
                      <div className="flex items-start gap-2.5">
                        {avatarSrc ? (
                          <Image
                            src={avatarSrc}
                            alt={invite.manager.displayName}
                            width={32}
                            height={32}
                            className="rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-n-surface text-xs font-bold text-n-ink">
                            {invite.manager.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-n-ink">
                            <span className="font-semibold">
                              {invite.manager.displayName}
                            </span>{" "}
                            wants to manage{" "}
                            <span className="font-medium">
                              {invite.creatorProfile.displayName}
                            </span>
                          </p>
                          {invite.inviteExpiresAt && (
                            <p className="mt-0.5 text-[10px] text-n-slate">
                              Expires{" "}
                              {new Date(
                                invite.inviteExpiresAt,
                              ).toLocaleDateString()}
                            </p>
                          )}
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                acceptMutation.mutate({
                                  accessId: invite.accessId,
                                })
                              }
                              disabled={
                                acceptMutation.isPending ||
                                declineMutation.isPending
                              }
                              className="rounded-md bg-n-red px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-n-red-hover disabled:opacity-50"
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                declineMutation.mutate({
                                  accessId: invite.accessId,
                                })
                              }
                              disabled={
                                acceptMutation.isPending ||
                                declineMutation.isPending
                              }
                              className="rounded-md border border-n-line bg-n-surface px-2.5 py-1 text-[11px] font-semibold text-n-ink transition-colors hover:bg-n-control disabled:opacity-50"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Admin pending claims section */}
            {userRole === "admin" && adminCount > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-n-slate">
                  Pending claim reviews
                </p>
                <Link
                  href="/dashboard/admin/claims"
                  onClick={() => setOpen(false)}
                  className="block border-b border-n-surface px-4 py-3 transition-colors hover:bg-n-surface last:border-b-0"
                >
                  <p className="text-xs text-n-ink">
                    <span className="font-semibold">{adminCount}</span> claim
                    {adminCount === 1 ? "" : "s"} awaiting review
                  </p>
                  <p className="mt-0.5 text-[10px] text-n-slate">
                    Open claim queue →
                  </p>
                </Link>
              </div>
            )}

            {/* Empty state */}
            {totalCount === 0 && (
              <div
                className={cn("px-4 py-8 text-center", "text-xs text-n-slate")}
              >
                You&apos;re all caught up.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
