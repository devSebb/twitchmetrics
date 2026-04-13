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
};

export function AddCreatorModal({ open, onClose }: AddCreatorModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const utils = trpc.useUtils();

  const searchQuery = trpc.talentManager.searchCreators.useQuery(
    { query: debouncedSearch },
    { enabled: debouncedSearch.length >= 2, retry: false },
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
      setDebouncedSearch(value.trim());
    }, 350);
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

  const results: SearchResult[] = searchQuery.data ?? [];

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
                    No claimed creators found for &ldquo;{debouncedSearch}
                    &rdquo;
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
                            <p className="truncate text-sm font-medium text-[#F2F3F5]">
                              {profile.displayName}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-[#949BA4]">
                                /{profile.slug}
                              </p>
                              {platformName && (
                                <span className="text-[10px] text-[#4E5058]">
                                  ·
                                </span>
                              )}
                              {platformName && (
                                <p className="text-xs text-[#949BA4]">
                                  {platformName}
                                </p>
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

            {error && <p className="mt-3 text-xs text-[#ef4444]">{error}</p>}
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
              {addMutation.isPending ? "Adding…" : "Add to Roster"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
