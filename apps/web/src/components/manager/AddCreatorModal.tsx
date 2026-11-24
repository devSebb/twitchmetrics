"use client";

import { useDialogFocus } from "@/hooks/useDialogFocus";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";
import type { Platform } from "@twitchmetrics/database";
import { PLATFORM_CONFIG } from "@/lib/constants/platforms";

type AddCreatorModalProps = {
  open: boolean;
  onClose: () => void;
};

type SearchResult = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  state: string;
  totalFollowers: string;
  primaryPlatform: Platform | null;
  isClaimed: boolean;
};

type SuccessState = {
  accessId: string;
  inviteUrl: string;
  expiresAt: Date;
  profileWasClaimed: boolean;
  creatorName: string;
};

type PendingExistsState = {
  accessId: string;
  inviteExpiresAt: Date | null;
  profileWasClaimed: boolean;
  creatorName: string;
};

function buildDmTemplate(opts: {
  creatorName: string;
  inviteUrl: string;
  profileWasClaimed: boolean;
}): string {
  if (opts.profileWasClaimed) {
    return `Hey ${opts.creatorName}. I'd like to manage your channel on Noticed. Accept the invitation here (expires in 5 days): ${opts.inviteUrl}`;
  }
  return `Hey ${opts.creatorName}. I'd like to manage your channel on Noticed. Sign up, claim your profile, then accept the invitation here (link expires in 5 days): ${opts.inviteUrl}`;
}

export function AddCreatorModal({ open, onClose }: AddCreatorModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [pendingExists, setPendingExists] = useState<PendingExistsState | null>(
    null,
  );
  const [copiedField, setCopiedField] = useState<"url" | "dm" | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  const searchQuery = trpc.talentManager.searchCreators.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2, retry: false },
  );

  const inviteMutation = trpc.talentManager.inviteCreator.useMutation({
    onSuccess: async (data) => {
      await utils.talentManager.getRoster.invalidate();
      const creator = results.find((r) => r.id === selectedId);
      const creatorName = creator?.displayName ?? "this creator";

      if (data.kind === "created") {
        setSuccess({
          accessId: data.accessId,
          inviteUrl: data.inviteUrl,
          expiresAt: new Date(data.expiresAt),
          profileWasClaimed: data.profileWasClaimed,
          creatorName,
        });
        setPendingExists(null);
        setError(null);
      } else if (data.kind === "pending_exists") {
        setPendingExists({
          accessId: data.accessId,
          inviteExpiresAt: data.inviteExpiresAt
            ? new Date(data.inviteExpiresAt)
            : null,
          profileWasClaimed: data.profileWasClaimed,
          creatorName,
        });
        setSuccess(null);
        setError(null);
      } else if (data.kind === "already_active") {
        setError(`${creatorName} is already in your active roster.`);
        setSuccess(null);
        setPendingExists(null);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const regenerateMutation = trpc.talentManager.regenerateInvite.useMutation({
    onSuccess: async (data) => {
      await utils.talentManager.getRoster.invalidate();
      if (!pendingExists) return;
      setSuccess({
        accessId: pendingExists.accessId,
        inviteUrl: data.inviteUrl,
        expiresAt: new Date(data.expiresAt),
        profileWasClaimed: pendingExists.profileWasClaimed,
        creatorName: pendingExists.creatorName,
      });
      setPendingExists(null);
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    setError(null);
    setSelectedId(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, 350);
  }, []);

  const handleInvite = () => {
    if (!selectedId) return;
    setError(null);
    inviteMutation.mutate({ creatorProfileId: selectedId });
  };

  const handleRegenerate = () => {
    if (!pendingExists) return;
    setError(null);
    regenerateMutation.mutate({ accessId: pendingExists.accessId });
  };

  const handleCopy = useCallback(async (text: string, field: "url" | "dm") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard may be unavailable; users can manually select the URL field.
    }
  }, []);

  const resetAndClose = () => {
    setSearch("");
    setDebouncedSearch("");
    setSelectedId(null);
    setError(null);
    setSuccess(null);
    setPendingExists(null);
    setCopiedField(null);
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") resetAndClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedId(null);
      setError(null);
      setSuccess(null);
      setPendingExists(null);
      setCopiedField(null);
    }
  }, [open]);

  const dialogRef = useDialogFocus(open);
  if (!open) return null;

  const results: SearchResult[] = searchQuery.data ?? [];
  const isPending = inviteMutation.isPending || regenerateMutation.isPending;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-black/50"
        onClick={resetAndClose}
        aria-hidden
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Invite a creator"
          tabIndex={-1}
          className="max-h-[85dvh] overflow-y-auto w-full max-w-lg rounded-lg border border-n-line bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-n-line px-5 py-4">
            <h2 className="text-lg font-semibold text-n-ink">
              {success ? "Invitation Sent" : "Invite Creator"}
            </h2>
            <button
              type="button"
              onClick={resetAndClose}
              aria-label="Close invitation"
              className="rounded-md p-3 text-n-slate transition-colors hover:bg-white hover:text-n-ink"
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Success panel */}
          {success && (
            <div className="p-5">
              <div className="flex items-start gap-3 rounded-lg border border-n-success/30 bg-n-success/10 px-3 py-3">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-n-success"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div className="text-sm text-n-success">
                  <p className="font-medium">
                    Invitation sent to {success.creatorName}
                  </p>
                  <p className="mt-0.5 text-xs text-n-ink">
                    {success.profileWasClaimed
                      ? "They can accept immediately from their notification bell or by opening this link."
                      : "They'll need to sign up and claim the profile first, then accept the invitation. Share this link with them:"}
                  </p>
                </div>
              </div>

              {/* Invite URL */}
              <div className="mt-4">
                <label className="text-xs font-medium text-n-slate">
                  Invitation link
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    aria-label="Invitation link"
                    value={success.inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg border border-n-line bg-white px-3 py-2 text-xs text-n-ink outline-none focus:border-n-red/50"
                  />
                  <Button
                    appearance="noticed"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopy(success.inviteUrl, "url")}
                  >
                    {copiedField === "url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-n-slate">
                  Link expires {success.expiresAt.toLocaleDateString()}
                </p>
              </div>

              {/* DM template */}
              <div className="mt-4">
                <label className="text-xs font-medium text-n-slate">
                  DM template
                </label>
                <textarea
                  readOnly
                  aria-label="Message template"
                  rows={3}
                  value={buildDmTemplate({
                    creatorName: success.creatorName,
                    inviteUrl: success.inviteUrl,
                    profileWasClaimed: success.profileWasClaimed,
                  })}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full resize-none rounded-lg border border-n-line bg-white px-3 py-2 text-xs text-n-ink outline-none focus:border-n-red/50"
                />
                <div className="mt-1 flex justify-end">
                  <Button
                    appearance="noticed"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      handleCopy(
                        buildDmTemplate({
                          creatorName: success.creatorName,
                          inviteUrl: success.inviteUrl,
                          profileWasClaimed: success.profileWasClaimed,
                        }),
                        "dm",
                      )
                    }
                  >
                    {copiedField === "dm" ? "Copied!" : "Copy template"}
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button appearance="noticed" size="sm" onClick={resetAndClose}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Pending-exists panel */}
          {!success && pendingExists && (
            <div className="p-5">
              <div className="rounded-lg border border-n-warning/30 bg-n-warning/10 px-3 py-3">
                <p className="text-sm font-medium text-n-warning">
                  Invitation already pending
                </p>
                <p className="mt-1 text-xs text-n-ink">
                  You already sent {pendingExists.creatorName} an invitation
                  {pendingExists.inviteExpiresAt
                    ? ` that expires ${pendingExists.inviteExpiresAt.toLocaleDateString()}`
                    : ""}
                  . Generate a fresh link to share again. the old link will stop
                  working.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button
                  appearance="noticed"
                  variant="ghost"
                  size="sm"
                  onClick={resetAndClose}
                >
                  Cancel
                </Button>
                <Button
                  appearance="noticed"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={regenerateMutation.isPending}
                >
                  {regenerateMutation.isPending
                    ? "Generating…"
                    : "Regenerate link"}
                </Button>
              </div>
            </div>
          )}

          {/* Search panel */}
          {!success && !pendingExists && (
            <>
              <div className="p-5">
                <input
                  type="search"
                  aria-label="Search creators by name or username"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by name or username…"
                  className="w-full rounded-lg border border-n-line bg-n-surface px-3 py-2 text-sm text-n-ink placeholder:text-n-slate focus:border-n-red focus:outline-none"
                  autoFocus
                />

                {searchQuery.isError && (
                  <p role="alert" className="mt-3 text-sm text-n-error">
                    Search could not load.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => searchQuery.refetch()}
                    >
                      Try again
                    </button>
                  </p>
                )}
                {/* Results */}
                <div className="mt-3 max-h-64 overflow-y-auto">
                  {searchQuery.isLoading && debouncedSearch.length >= 2 && (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-n-slate border-t-transparent" />
                    </div>
                  )}

                  {!searchQuery.isLoading &&
                    !searchQuery.isError &&
                    debouncedSearch.length >= 2 &&
                    results.length === 0 && (
                      <p className="py-6 text-center text-sm text-n-slate">
                        No creators found for &ldquo;{debouncedSearch}&rdquo;
                      </p>
                    )}

                  {debouncedSearch.length < 2 && (
                    <p className="py-6 text-center text-sm text-n-slate">
                      Type a name or username to search
                    </p>
                  )}

                  {results.length > 0 && (
                    <div className="space-y-1">
                      {results.map((profile) => {
                        const isSelected = selectedId === profile.id;
                        const avatarSrc = getSafeImageSrc(profile.avatarUrl);
                        const platformName = profile.primaryPlatform
                          ? PLATFORM_CONFIG[profile.primaryPlatform]?.name
                          : null;

                        return (
                          <button
                            key={profile.id}
                            aria-pressed={isSelected}
                            type="button"
                            onClick={() =>
                              setSelectedId(isSelected ? null : profile.id)
                            }
                            className={`w-full rounded-lg border p-3 text-left transition-colors ${
                              isSelected
                                ? "border-n-red bg-n-red/10"
                                : "border-n-line hover:border-n-line hover:bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {avatarSrc ? (
                                <Image
                                  src={avatarSrc}
                                  alt={profile.displayName}
                                  width={36}
                                  height={36}
                                  className="rounded-full"
                                />
                              ) : (
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-n-surface text-sm font-bold text-n-ink">
                                  {profile.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-sm font-medium text-n-ink">
                                    {profile.displayName}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                                      profile.isClaimed
                                        ? "bg-n-success/15 text-n-success"
                                        : "bg-n-slate/15 text-n-slate"
                                    }`}
                                  >
                                    {profile.isClaimed
                                      ? "Claimed"
                                      : "Unclaimed"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs text-n-slate">
                                    /{profile.slug}
                                  </p>
                                  {platformName && (
                                    <>
                                      <span className="text-xs text-n-slate">
                                        ·
                                      </span>
                                      <p className="text-xs text-n-slate">
                                        {platformName}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                              <p className="shrink-0 text-xs text-n-slate">
                                {formatNumber(Number(profile.totalFollowers))}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {error && <p className="mt-3 text-xs text-n-error">{error}</p>}
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-n-line px-5 py-4">
                <Button
                  appearance="noticed"
                  variant="ghost"
                  size="sm"
                  onClick={resetAndClose}
                >
                  Cancel
                </Button>
                <Button
                  appearance="noticed"
                  size="sm"
                  disabled={!selectedId || isPending}
                  onClick={handleInvite}
                >
                  {inviteMutation.isPending ? "Sending…" : "Send invitation"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
