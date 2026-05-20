"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, UploadSimple, Trash, Spinner } from "@phosphor-icons/react";
import { useAvatarUpload } from "@/hooks/useAvatarUpload";
import { cn } from "@/lib/utils";

type AvatarEditModalProps = {
  open: boolean;
  onClose: () => void;
  currentUrl: string | null;
  onUpdated?: ((newUrl: string | null) => void) | undefined;
};

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarEditModal({
  open,
  onClose,
  currentUrl,
  onUpdated,
}: AvatarEditModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { upload, remove, status, error, isBusy } = useAvatarUpload({
    onUploaded: (url) => {
      onUpdated?.(url);
      onClose();
    },
    onRemoved: () => {
      onUpdated?.(null);
      onClose();
    },
  });

  const reset = useCallback(() => {
    setFile(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setValidationError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, isBusy, onClose]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = (next: File) => {
    setValidationError(null);
    if (!ACCEPT.split(",").includes(next.type)) {
      setValidationError("Use JPG, PNG, or WebP.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setValidationError("File must be 2 MB or less.");
      return;
    }
    setFile(next);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(next);
    });
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !isBusy && onClose()}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-[#3F4147] bg-[#2B2D31] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
          <h2 className="text-base font-semibold text-[#F2F3F5]">
            Update profile picture
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close"
            className="rounded-md p-1 text-[#949BA4] transition-colors hover:bg-[#383A40] hover:text-[#F2F3F5] disabled:opacity-50"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {previewUrl ? (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="h-20 w-20 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#F2F3F5]">
                  {file?.name}
                </p>
                <p className="text-xs text-[#949BA4]">
                  {((file?.size ?? 0) / 1024).toFixed(0)} KB · {file?.type}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  disabled={isBusy}
                  className="mt-1 text-xs text-[#949BA4] underline hover:text-[#DBDEE1] disabled:opacity-50"
                >
                  Choose different file
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#3F4147] bg-[#1E1F22] px-4 py-8 text-center transition-colors hover:border-[#E32C19]/60 hover:bg-[#1E1F22]/80",
              )}
            >
              <UploadSimple
                size={22}
                weight="bold"
                className="text-[#949BA4]"
              />
              <p className="mt-2 text-sm font-medium text-[#DBDEE1]">
                Drag &amp; drop or click to browse
              </p>
              <p className="mt-1 text-xs text-[#949BA4]">
                JPG, PNG, WebP · max 2 MB
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (next) handleFile(next);
              event.target.value = "";
            }}
          />

          {(validationError || error) && (
            <p className="rounded-md border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs text-[#fca5a5]">
              {validationError ?? error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#3F4147] px-5 py-4">
          {currentUrl ? (
            <button
              type="button"
              onClick={remove}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#fca5a5] transition-colors hover:text-[#ef4444] disabled:opacity-50"
            >
              <Trash size={14} weight="bold" />
              Remove current
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-[#DBDEE1] transition-colors hover:bg-[#383A40] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => file && upload(file)}
              disabled={!file || isBusy}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold text-white transition-colors",
                !file || isBusy
                  ? "cursor-not-allowed bg-[#5C5F66]"
                  : "bg-[#E32C19] hover:bg-[#C72615]",
              )}
            >
              {status === "uploading" && (
                <Spinner size={14} className="animate-spin" />
              )}
              Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
