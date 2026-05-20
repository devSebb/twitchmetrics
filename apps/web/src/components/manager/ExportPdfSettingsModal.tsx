"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowSquareOut, Spinner, X } from "@phosphor-icons/react";
import { trpc } from "@/lib/trpc";
import { downloadFile } from "@/lib/download";
import { THEME } from "@/lib/constants/theme";
import { resolveAvatar } from "@/lib/avatar";
import { getSafeImageSrc } from "@/lib/safeImage";
import { cn } from "@/lib/utils";

type ExportPdfSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function ExportPdfSettingsModal({
  open,
  onClose,
}: ExportPdfSettingsModalProps) {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, { enabled: open });
  const profileQuery = trpc.talentManager.getMyProfile.useQuery(undefined, {
    enabled: open,
  });

  const defaultColor = useMemo(
    () => profileQuery.data?.brandColor ?? THEME.colors.brandRed,
    [profileQuery.data?.brandColor],
  );
  const [brandColor, setBrandColor] = useState(defaultColor);
  const [error, setError] = useState<string | null>(null);

  // Sync the input when the saved value loads.
  useEffect(() => {
    if (open) setBrandColor(defaultColor);
  }, [open, defaultColor]);

  const exportMutation = trpc.talentManager.exportRoster.useMutation({
    onSuccess: (result) => {
      if (result.mimeType !== "application/pdf" || !("encoding" in result)) {
        setError("Unexpected export response.");
        return;
      }
      const blob = base64ToBlob(result.content, result.mimeType);
      downloadFile({
        filename: result.filename,
        mimeType: result.mimeType,
        content: blob,
      });
      void utils.talentManager.getMyProfile.invalidate();
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    if (!open) {
      setError(null);
      exportMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !exportMutation.isPending) onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, exportMutation.isPending, onClose]);

  if (!open) return null;

  const managerAvatar = resolveAvatar("talent_manager", {
    user: { image: meQuery.data?.image ?? null },
    manager: { avatarUrl: profileQuery.data?.avatarUrl ?? null },
  });
  const avatarSrc = getSafeImageSrc(managerAvatar);
  const managerName = meQuery.data?.name ?? "Talent Manager";
  const initial = managerName.charAt(0).toUpperCase() || "?";

  const isValidColor = HEX_PATTERN.test(brandColor);
  const isPending = exportMutation.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-[#3F4147] bg-[#2B2D31] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
          <h2 className="text-base font-semibold text-[#F2F3F5]">
            Export roster as PDF
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="rounded-md p-1 text-[#949BA4] transition-colors hover:bg-[#383A40] hover:text-[#F2F3F5] disabled:opacity-50"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Logo preview */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
              Cover logo
            </p>
            <div className="flex items-center gap-3">
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt={managerName}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#383A40] text-lg font-bold text-[#F2F3F5]">
                  {initial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[#DBDEE1]">
                  Appears on the PDF cover.
                </p>
                <Link
                  href="/dashboard/settings"
                  className="mt-1 inline-flex items-center gap-1 text-xs text-[#93c5fd] hover:underline"
                >
                  Update in Settings
                  <ArrowSquareOut size={12} weight="bold" />
                </Link>
              </div>
            </div>
          </div>

          {/* Brand color */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#949BA4]">
              Brand color
            </p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                disabled={isPending}
                className="h-10 w-12 cursor-pointer rounded-md border border-[#3F4147] bg-[#1E1F22] disabled:cursor-not-allowed"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(event) => {
                  const next = event.target.value;
                  setBrandColor(next.startsWith("#") ? next : `#${next}`);
                }}
                disabled={isPending}
                spellCheck={false}
                maxLength={7}
                className={cn(
                  "flex-1 rounded-md border bg-[#1E1F22] px-3 py-2 text-sm font-mono uppercase text-[#F2F3F5] outline-none transition-colors disabled:cursor-not-allowed",
                  isValidColor
                    ? "border-[#3F4147] focus:border-[#4E5058]"
                    : "border-[#ef4444]/60",
                )}
              />
            </div>
            <p className="mt-1.5 text-xs text-[#949BA4]">
              Used for the cover bar, card stripes, and footer accent.
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5]">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#3F4147] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => exportMutation.mutate({ format: "pdf", brandColor })}
            disabled={!isValidColor || isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-colors",
              !isValidColor || isPending
                ? "cursor-not-allowed bg-[#5C5F66]"
                : "bg-[#E32C19] hover:bg-[#C72615]",
            )}
          >
            {isPending && <Spinner size={14} className="animate-spin" />}
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
