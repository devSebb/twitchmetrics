"use client";

import { useCallback, useId, useState } from "react";
import { useDialogFocus } from "@/hooks/useDialogFocus";

/** "Read full bio" control with its panel: a centred dialog on wide screens
 * and a bottom sheet on phones. The text is always in the document and only
 * hidden while closed, so it stays readable to crawlers and without script. */
export function CreatorBioPanel({ name, bio }: { name: string; bio: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogFocus(open, close);
  const headingId = useId();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold underline underline-offset-4"
      >
        Read full bio
      </button>
      <div
        data-bio-panel
        className={
          open
            ? "fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
            : "hidden"
        }
      >
        <div
          data-bio-backdrop
          aria-hidden
          onClick={close}
          className="absolute inset-0 bg-black/60"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          tabIndex={-1}
          className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white text-n-ink shadow-2xl sm:max-h-[80dvh] sm:max-w-[640px] sm:rounded-2xl"
        >
          <div className="flex items-center justify-between gap-4 border-b border-n-line py-3 pl-6 pr-3">
            <h2
              id={headingId}
              className="min-w-0 break-words text-lg font-bold tracking-tight"
            >
              About {name}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close bio"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-n-slate hover:bg-n-surface hover:text-n-ink"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <p className="overflow-y-auto whitespace-pre-line break-words px-6 pb-8 pt-5 text-base font-normal leading-relaxed tracking-normal">
            {bio}
          </p>
        </div>
      </div>
    </>
  );
}
