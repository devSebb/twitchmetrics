"use client";

import Image from "next/image";
import { getSafeImageSrc } from "@/lib/safeImage";

type InvitePreviewCardProps = {
  managerName: string | null;
  managerImage: string | null;
  agencyName: string | null;
  bio: string | null;
};

/**
 * Read-only preview of what a creator sees on the /invite/roster landing
 * page. Mirrors PendingHeader. Gives the manager a concrete reason to
 * fill agency name and bio.
 */
export function InvitePreviewCard({
  managerName,
  managerImage,
  agencyName,
  bio,
}: InvitePreviewCardProps) {
  const safeImage = getSafeImageSrc(managerImage);
  const name = managerName?.trim() || "A talent manager";
  const agency = agencyName?.trim() || null;
  const bioText = bio?.trim() || null;

  return (
    <div className="rounded-xl border border-n-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-n-ink">Invite preview</h3>
        <span className="rounded bg-n-surface px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-n-slate">
          What creators see
        </span>
      </div>
      <div className="rounded-lg border border-n-line bg-white p-4">
        <div className="flex items-center gap-3">
          {safeImage ? (
            <Image
              src={safeImage}
              alt={name}
              width={48}
              height={48}
              className="rounded-full"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-n-surface text-lg font-bold text-n-ink">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-n-slate">
              Roster invitation
            </p>
            <p className="text-base font-bold text-n-ink">
              {name}{" "}
              <span className="font-normal text-n-ink">
                would like to manage you
              </span>
            </p>
            {agency && <p className="text-xs text-n-slate">{agency}</p>}
          </div>
        </div>
        {bioText && (
          <p className="mt-3 text-xs italic text-n-ink">
            &ldquo;{bioText}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
