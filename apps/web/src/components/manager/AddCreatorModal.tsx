"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { Button, Card } from "@/components/ui";
import { formatNumber } from "@/lib/utils/format";
import { getSafeImageSrc } from "@/lib/safeImage";

type AddCreatorModalProps = {
  open: boolean;
  onClose: () => void;
};

export function AddCreatorModal({ open, onClose }: AddCreatorModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  const searchQuery = trpc.creator.getProfile.useQuery(
    { slug: debouncedSearch },
    {
      enabled: debouncedSearch.length >= 2,
      retry: false,
    },
  );

  const addMutation = trpc.talentManager.addCreator.useMutation({
    onSuccess: async () => {
      await utils.talentManager.getRoster.invalidate();
      setSearch("");
      setDebouncedSearch("");
      setSelectedId(null);
      setError(null);
      onClose();
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
      setDebouncedSearch(value.trim().toLowerCase());
    }, 400);
  }, []);

  const handleAdd = () => {
    if (!selectedId) return;
    addMutation.mutate({ creatorProfileId: selectedId });
  };

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedId(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const profile = searchQuery.data;
  const isClaimed =
    profile?.state === "claimed" || profile?.state === "premium";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-[#3F4147] bg-[#1E1F22] shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#3F4147] px-5 py-4">
            <h2 className="text-lg font-semibold text-[#F2F3F5]">
              Add Creator
            </h2>
            <button
              type="button"
              onClick={onClose}
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

          {/* Body */}
          <div className="p-5">
            <p className="mb-3 text-xs text-[#949BA4]">
              Search for a creator by their profile slug. Only claimed profiles
              can be managed.
            </p>

            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Enter creator slug (e.g. ninja)"
              className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] px-3 py-2 text-sm text-[#F2F3F5] placeholder-[#949BA4] focus:border-[#E32C19] focus:outline-none"
              autoFocus
            />

            {/* Search results */}
            <div className="mt-3 min-h-[80px]">
              {searchQuery.isLoading && debouncedSearch.length >= 2 && (
                <div className="flex items-center justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#949BA4] border-t-transparent" />
                </div>
              )}

              {searchQuery.isError && debouncedSearch.length >= 2 && (
                <p className="py-4 text-center text-xs text-[#949BA4]">
                  No creator found with that slug.
                </p>
              )}

              {profile && (
                <button
                  type="button"
                  onClick={() => {
                    if (isClaimed) setSelectedId(profile.id);
                  }}
                  disabled={!isClaimed}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedId === profile.id
                      ? "border-[#E32C19] bg-[#E32C19]/10"
                      : isClaimed
                        ? "border-[#3F4147] hover:border-[#4E5058] hover:bg-[#313338]"
                        : "cursor-not-allowed border-[#3F4147] opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {(() => {
                      const src = getSafeImageSrc(profile.avatarUrl);
                      return src ? (
                        <Image
                          src={src}
                          alt={profile.displayName}
                          width={40}
                          height={40}
                          className="rounded-full"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#383A40] text-sm font-bold text-[#F2F3F5]">
                          {profile.displayName.charAt(0)}
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-[#F2F3F5]">
                        {profile.displayName}
                      </p>
                      <p className="text-xs text-[#949BA4]">
                        {formatNumber(Number(profile.totalFollowers ?? 0))}{" "}
                        followers
                      </p>
                    </div>
                    {!isClaimed && (
                      <span className="shrink-0 rounded bg-[#383A40] px-2 py-0.5 text-[10px] text-[#949BA4]">
                        Unclaimed
                      </span>
                    )}
                  </div>
                </button>
              )}

              {!searchQuery.isLoading &&
                !profile &&
                debouncedSearch.length < 2 && (
                  <p className="py-4 text-center text-xs text-[#949BA4]">
                    Type a creator slug to search.
                  </p>
                )}
            </div>

            {error && <p className="mt-2 text-xs text-[#ef4444]">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#3F4147] px-5 py-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!selectedId || addMutation.isPending}
              onClick={handleAdd}
            >
              {addMutation.isPending ? "Adding..." : "Add to Roster"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
