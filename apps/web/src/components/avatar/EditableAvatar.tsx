"use client";

import Image from "next/image";
import { useState } from "react";
import { Pencil } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { getSafeImageSrc } from "@/lib/safeImage";
import { AvatarEditModal } from "./AvatarEditModal";

type EditableAvatarProps = {
  src: string | null;
  displayName: string;
  size?: number;
  canEdit: boolean;
  onUpdated?: (newUrl: string | null) => void;
  className?: string;
};

/**
 * Circular avatar with an optional edit-pencil button at bottom-left.
 * The edit affordance opens an `AvatarEditModal`. When `canEdit` is false,
 * renders a static avatar without any UI overhead.
 */
export function EditableAvatar({
  src,
  displayName,
  size = 96,
  canEdit,
  onUpdated,
  className,
}: EditableAvatarProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const safeSrc = getSafeImageSrc(src);
  const initial = displayName.charAt(0).toUpperCase() || "?";

  // Edit pencil scales down proportionally for very small avatars.
  const buttonSize = Math.max(28, Math.round(size * 0.32));
  const buttonIcon = Math.max(12, Math.round(buttonSize * 0.5));

  return (
    <>
      <div
        className={cn("relative inline-block", className)}
        style={{ width: size, height: size }}
      >
        {safeSrc ? (
          <Image
            src={safeSrc}
            alt={displayName}
            width={size}
            height={size}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-[#383A40] font-bold text-[#F2F3F5]"
            style={{ fontSize: Math.round(size * 0.4) }}
            aria-label={displayName}
          >
            {initial}
          </div>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            aria-label="Edit profile picture"
            className="absolute bottom-0 left-0 flex items-center justify-center rounded-full border-2 border-[#1E1F22] bg-[#E32C19] text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E32C19]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E1F22]"
            style={{ width: buttonSize, height: buttonSize }}
          >
            <Pencil size={buttonIcon} weight="bold" />
          </button>
        )}
      </div>

      {canEdit && (
        <AvatarEditModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          currentUrl={src}
          onUpdated={onUpdated}
        />
      )}
    </>
  );
}
