"use client";

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
    return `Hey ${opts.creatorName} — I'd like to manage your channel on TwitchMetrics. Accept the invitation here (expires in 5 days): ${opts.inviteUrl}`;
  }
  return `Hey ${opts.creatorName} — I'd like to manage your channel on TwitchMetrics. Sign up, claim your profile, then accept the invitation here (link expires in 5 days): ${opts.inviteUrl}`;
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

  if (!open) return null;

  const results: SearchResult[] = searchQuery.data ?? [];
  const isPending = inviteMutation.isPending || regenerateMutation.isPending;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={resetAndClose}
        aria-hidden
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-[#3F4147] bg-[#1E1F22] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#F2F3F5]">
              {success ? "Invitation Sent" : "Invite Creator"}
            </h2>
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-md p-1 text-[#949BA4] transition-colors hover:bg-[#313338] hover:text-[#DBDEE1]"
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
              <div className="flex items-start gap-3 rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-3">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]"
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
                <div className="text-sm text-[#86efac]">
                  <p className="font-medium">
                    Invitation sent to {success.creatorName}
                  </p>
                  <p className="mt-0.5 text-xs text-[#DBDEE1]">
                    {success.profileWasClaimed
                      ? "They can accept immediately from their notification bell or by opening this link."
                      : "They'll need to sign up and claim the profile first, then accept the invitation. Share this link with them:"}
                  </p>
                </div>
              </div>

              {/* Invite URL */}
              <div className="mt-4">
                <label className="text-xs font-medium text-[#949BA4]">
                  Invitation link
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={success.inviteUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-xs text-[#DBDEE1] outline-none focus:border-[#E32C19]/50"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleCopy(success.inviteUrl, "url")}
                  >
                    {copiedField === "url" ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-[#949BA4]">
                  Link expires {success.expiresAt.toLocaleDateString()}
                </p>
              </div>

              {/* DM template */}
              <div className="mt-4">
                <label className="text-xs font-medium text-[#949BA4]">
                  DM template
                </label>
                <textarea
                  readOnly
                  rows={3}
                  value={buildDmTemplate({
                    creatorName: success.creatorName,
                    inviteUrl: success.inviteUrl,
                    profileWasClaimed: success.profileWasClaimed,
                  })}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-1 w-full resize-none rounded-lg border border-[#3F4147] bg-[#1E1F22] px-3 py-2 text-xs text-[#DBDEE1] outline-none focus:border-[#E32C19]/50"
                />
                <div className="mt-1 flex justify-end">
                  <Button
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
                <Button size="sm" onClick={resetAndClose}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {/* Pending-exists panel */}
          {!success && pendingExists && (
            <div className="p-5">
              <div className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-3">
                <p className="text-sm font-medium text-[#fcd34d]">
                  Invitation already pending
                </p>
                <p className="mt-1 text-xs text-[#DBDEE1]">
                  You already sent {pendingExists.creatorName} an invitation
                  {pendingExists.inviteExpiresAt
                    ? ` that expires ${pendingExists.inviteExpiresAt.toLocaleDateString()}`
                    : ""}
                  . Generate a fresh link to share again — the old link will
                  stop working.
                </p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={resetAndClose}>
                  Cancel
                </Button>
                <Button
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
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by name or username…"
                  className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5] placeholder-[#949BA4] focus:border-[#E32C19] focus:outline-none"
                  autoFocus
                />

                {/* Results */}
                <div className="mt-3 max-h-64 overflow-y-auto">
                  {searchQuery.isLoading && debouncedSearch.length >= 2 && (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#949BA4] border-t-transparent" />
                    </div>
                  )}

                  {!searchQuery.isLoading &&
                    debouncedSearch.length >= 2 &&
                    results.length === 0 && (
                      <p className="py-6 text-center text-sm text-[#949BA4]">
                        No creators found for &ldquo;{debouncedSearch}&rdquo;
                      </p>
                    )}

                  {debouncedSearch.length < 2 && (
                    <p className="py-6 text-center text-sm text-[#949BA4]">
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
                            type="button"
                            onClick={() =>
                              setSelectedId(isSelected ? null : profile.id)
                            }
                            className={`w-full rounded-lg border p-3 text-left transition-colors ${
                              isSelected
                                ? "border-[#E32C19] bg-[#E32C19]/10"
                                : "border-[#3F4147] hover:border-[#4E5058] hover:bg-[#313338]"
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
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#383A40] text-sm font-bold text-[#F2F3F5]">
                                  {profile.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-sm font-medium text-[#F2F3F5]">
                                    {profile.displayName}
                                  </p>
                                  <span
                                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                                      profile.isClaimed
                                        ? "bg-[#22c55e]/15 text-[#86efac]"
                                        : "bg-[#949BA4]/15 text-[#949BA4]"
                                    }`}
                                  >
                                    {profile.isClaimed
                                      ? "Claimed"
                                      : "Unclaimed"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs text-[#949BA4]">
                                    /{profile.slug}
                                  </p>
                                  {platformName && (
                                    <>
                                      <span className="text-[10px] text-[#4E5058]">
                                        ·
                                      </span>
                                      <p className="text-xs text-[#949BA4]">
                                        {platformName}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </div>
                              <p className="shrink-0 text-xs text-[#949BA4]">
                                {formatNumber(Number(profile.totalFollowers))}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {error && (
                  <p className="mt-3 text-xs text-[#ef4444]">{error}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-[#3F4147] px-5 py-4">
                <Button variant="ghost" size="sm" onClick={resetAndClose}>
                  Cancel
                </Button>
                <Button
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
