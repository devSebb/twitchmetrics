"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
        className="relative rounded-md p-2 text-[#949BA4] transition-colors hover:text-[#DBDEE1]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {totalCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#E32C19] px-1 text-[9px] font-bold text-white">
            {totalCount > 9 ? "9+" : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-[#3F4147] bg-[#1E1F22] shadow-xl">
          <div className="border-b border-[#3F4147] px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F2F3F5]">
              Notifications
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {/* Roster invitations section */}
            {inviteCount > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#949BA4]">
                  Roster invitations
                </p>
                {invites.map((invite) => {
                  const avatarSrc = invite.manager.avatarUrl
                    ? getSafeImageSrc(invite.manager.avatarUrl)
                    : null;
                  return (
                    <div
                      key={invite.accessId}
                      className="border-b border-[#2B2D31] px-4 py-3 last:border-b-0"
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
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-xs font-bold text-[#F2F3F5]">
                            {invite.manager.displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#DBDEE1]">
                            <span className="font-semibold">
                              {invite.manager.displayName}
                            </span>{" "}
                            wants to manage{" "}
                            <span className="font-medium">
                              {invite.creatorProfile.displayName}
                            </span>
                          </p>
                          {invite.inviteExpiresAt && (
                            <p className="mt-0.5 text-[10px] text-[#949BA4]">
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
                              className="rounded-md bg-[#E32C19] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
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
                              className="rounded-md border border-[#3F4147] bg-[#383A40] px-2.5 py-1 text-[11px] font-semibold text-[#DBDEE1] transition-colors hover:bg-[#4E5058] disabled:opacity-50"
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
                <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-[#949BA4]">
                  Pending claim reviews
                </p>
                <Link
                  href="/dashboard/admin/claims"
                  onClick={() => setOpen(false)}
                  className="block border-b border-[#2B2D31] px-4 py-3 transition-colors hover:bg-[#313338] last:border-b-0"
                >
                  <p className="text-xs text-[#DBDEE1]">
                    <span className="font-semibold">{adminCount}</span> claim
                    {adminCount === 1 ? "" : "s"} awaiting review
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#949BA4]">
                    Open claim queue →
                  </p>
                </Link>
              </div>
            )}

            {/* Empty state */}
            {totalCount === 0 && (
              <div
                className={cn(
                  "px-4 py-8 text-center",
                  "text-xs text-[#949BA4]",
                )}
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
