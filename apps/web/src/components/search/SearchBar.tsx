"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { getSafeImageSrc } from "@/lib/safeImage";

type SearchResult = {
  data: {
    creators: {
      id: string;
      displayName: string;
      slug: string;
      avatarUrl: string | null;
      totalFollowers: string;
      relevance: number;
    }[];
    games: {
      id: string;
      name: string;
      slug: string;
      coverImageUrl: string | null;
      currentViewers: number;
      relevance: number;
    }[];
  };
  meta: { query: string; totalResults: number };
};

type SearchBarProps = {
  mode: "compact" | "full";
  defaultQuery?: string;
  autoFocus?: boolean;
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchBar({
  mode,
  defaultQuery = "",
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  const shouldFetch = debouncedQuery.length >= 2;

  const { data, isLoading } = useQuery<SearchResult>({
    queryKey: ["search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}`,
      );
      return res.json() as Promise<SearchResult>;
    },
    enabled: shouldFetch,
    staleTime: 30_000,
  });

  const creators = useMemo(() => data?.data.creators ?? [], [data]);
  const games = useMemo(() => data?.data.games ?? [], [data]);
  const allItems = useMemo(
    () => [
      ...creators.slice(0, 5).map((c) => ({ type: "creator" as const, ...c })),
      ...games.slice(0, 5).map((g) => ({ type: "game" as const, ...g })),
    ],
    [creators, games],
  );

  // Close dropdown on click outside
  useEffect(() => {
    if (mode !== "compact") return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [mode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
        return;
      }

      if (e.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < allItems.length) {
          const item = allItems[activeIndex]!;
          const href =
            item.type === "creator"
              ? `/creator/${item.slug}`
              : `/game/${item.slug}`;
          router.push(href);
          setOpen(false);
        } else if (query.length >= 2) {
          router.push(`/search?q=${encodeURIComponent(query)}`);
          setOpen(false);
        }
        return;
      }

      if (
        mode === "compact" &&
        (e.key === "ArrowDown" || e.key === "ArrowUp")
      ) {
        e.preventDefault();
        setActiveIndex((prev) => {
          const max = allItems.length;
          if (e.key === "ArrowDown") return prev < max - 1 ? prev + 1 : 0;
          return prev > 0 ? prev - 1 : max - 1;
        });
      }
    },
    [activeIndex, allItems, mode, query, router],
  );

  const showDropdown = mode === "compact" && open && shouldFetch;

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#1E1F22] transition-colors focus-within:border-[#E32C19]/50",
          mode === "compact" ? "h-9 px-3" : "h-11 px-4",
        )}
      >
        <svg
          className="h-4 w-4 flex-shrink-0 text-[#949BA4]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search creators & games..."
          autoFocus={autoFocus}
          className={cn(
            "w-full bg-transparent text-[#DBDEE1] placeholder-[#949BA4] outline-none",
            mode === "compact" ? "text-sm" : "text-base",
          )}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="flex-shrink-0 text-[#949BA4] hover:text-[#DBDEE1]"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Compact mode: dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-[#3F4147] bg-[#2B2D31] shadow-xl">
          {isLoading && (
            <div className="px-4 py-6 text-center text-sm text-[#949BA4]">
              Searching...
            </div>
          )}

          {!isLoading && allItems.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[#949BA4]">
              No results for &ldquo;{debouncedQuery}&rdquo;
            </div>
          )}

          {!isLoading && creators.length > 0 && (
            <div>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-[#949BA4]">
                Creators
              </div>
              {creators.slice(0, 5).map((c, i) => (
                <Link
                  key={c.id}
                  href={`/creator/${c.slug}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#383A40]",
                    activeIndex === i && "bg-[#383A40]",
                  )}
                >
                  <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                    {getSafeImageSrc(c.avatarUrl) ? (
                      <Image
                        src={getSafeImageSrc(c.avatarUrl)!}
                        alt={c.displayName}
                        fill
                        className="object-cover"
                        sizes="32px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white bg-[#9146ff]">
                        {c.displayName.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#DBDEE1]">
                      {c.displayName}
                    </div>
                  </div>
                  <span className="text-xs text-[#949BA4]">
                    {formatNumber(Number(c.totalFollowers))} followers
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && games.length > 0 && (
            <div>
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-[#949BA4]">
                Games
              </div>
              {games.slice(0, 5).map((g, i) => (
                <Link
                  key={g.id}
                  href={`/game/${g.slug}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 transition-colors hover:bg-[#383A40]",
                    activeIndex === creators.slice(0, 5).length + i &&
                      "bg-[#383A40]",
                  )}
                >
                  <div className="relative h-8 w-10 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                    {g.coverImageUrl ? (
                      <Image
                        src={g.coverImageUrl}
                        alt={g.name}
                        fill
                        className="object-cover"
                        sizes="40px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#949BA4] bg-[#1E1F22]">
                        {g.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#DBDEE1]">
                      {g.name}
                    </div>
                  </div>
                  <span className="text-xs text-[#949BA4]">
                    {formatNumber(g.currentViewers)} viewers
                  </span>
                </Link>
              ))}
            </div>
          )}

          {!isLoading && allItems.length > 0 && (
            <Link
              href={`/search?q=${encodeURIComponent(query)}`}
              onClick={() => setOpen(false)}
              className="block border-t border-[#3F4147] px-4 py-2.5 text-center text-xs font-medium text-[#E32C19] transition-colors hover:bg-[#383A40]"
            >
              View all results
            </Link>
          )}
        </div>
      )}

      {/* Full mode: inline results */}
      {mode === "full" && shouldFetch && (
        <div className="mt-6">
          {isLoading && (
            <div className="text-sm text-[#949BA4]">Searching...</div>
          )}

          {!isLoading && allItems.length === 0 && (
            <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-10 text-center">
              <p className="text-lg font-medium text-[#DBDEE1]">
                No results for &ldquo;{debouncedQuery}&rdquo;
              </p>
              <p className="mt-1 text-sm text-[#949BA4]">
                Try a different search term
              </p>
            </div>
          )}

          {!isLoading && creators.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold uppercase text-[#949BA4]">
                Creators
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {creators.map((c) => (
                  <Link
                    key={c.id}
                    href={`/creator/${c.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                  >
                    <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[#383A40]">
                      {getSafeImageSrc(c.avatarUrl) ? (
                        <Image
                          src={getSafeImageSrc(c.avatarUrl)!}
                          alt={c.displayName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white bg-[#9146ff]">
                          {c.displayName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#DBDEE1]">
                        {c.displayName}
                      </div>
                      <div className="text-xs text-[#949BA4]">
                        {formatNumber(Number(c.totalFollowers))} followers
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {!isLoading && games.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase text-[#949BA4]">
                Games
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {games.map((g) => (
                  <Link
                    key={g.id}
                    href={`/game/${g.slug}`}
                    className="flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 transition-colors hover:border-[#4E5058] hover:bg-[#383A40]"
                  >
                    <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-[#383A40]">
                      {g.coverImageUrl ? (
                        <Image
                          src={g.coverImageUrl}
                          alt={g.name}
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[#949BA4] bg-[#1E1F22]">
                          {g.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[#DBDEE1]">
                        {g.name}
                      </div>
                      <div className="text-xs text-[#949BA4]">
                        {formatNumber(g.currentViewers)} viewers
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
