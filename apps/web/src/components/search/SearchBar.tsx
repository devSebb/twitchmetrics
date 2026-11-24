"use client";

import { useState, useRef, useEffect, useId, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { getSafeImageSrc } from "@/lib/safeImage";
import { buildSearchUrl, type SearchType } from "@/lib/search";
import { GameCoverImage } from "@/components/games/GameCoverImage";

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
  mode: "compact" | "full" | "hero";
  defaultQuery?: string;
  autoFocus?: boolean;
  searchType?: SearchType;
  appearance?: "noticed";
};

export function SearchBar({
  mode,
  defaultQuery = "",
  autoFocus = false,
  searchType = "all",
  appearance: _appearance,
}: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(defaultQuery.trim());
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const autocomplete = mode !== "full";
  const trimmedQuery = query.trim();
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(trimmedQuery), 300);
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  const { data, isLoading, isError } = useQuery<SearchResult>({
    queryKey: ["search", debouncedQuery, searchType],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q: debouncedQuery });
      if (searchType !== "all") params.set("type", searchType);
      const res = await fetch(`/api/search?${params}`, { signal });
      if (!res.ok) throw new Error("Search unavailable");
      return res.json() as Promise<SearchResult>;
    },
    enabled: autocomplete && debouncedQuery.length >= 2,
    staleTime: 30_000,
    retry: 1,
  });
  const items = useMemo(
    () => [
      ...(data?.data.creators ?? []).slice(0, 5).map((creator) => ({
        id: creator.id,
        name: creator.displayName,
        href: `/creator/${creator.slug}`,
        image: creator.avatarUrl,
        type: "creator" as const,
        metric: `${formatNumber(Number(creator.totalFollowers))} followers`,
      })),
      ...(data?.data.games ?? []).slice(0, 5).map((game) => ({
        id: game.id,
        name: game.name,
        href: `/game/${game.slug}`,
        image: game.coverImageUrl,
        type: "game" as const,
        metric: `${formatNumber(game.currentViewers)} viewers`,
      })),
    ],
    [data],
  );
  const pending = isLoading || trimmedQuery !== debouncedQuery;
  const showDropdown = autocomplete && open && trimmedQuery.length >= 2;
  const selectableItems = pending || isError ? [] : items;

  useEffect(() => {
    if (!autocomplete) return;
    function outside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      )
        setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [autocomplete]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = showDropdown ? selectableItems[activeIndex] : undefined;
    if (selected) router.push(selected.href);
    else if (trimmedQuery.length >= 2)
      router.push(buildSearchUrl(trimmedQuery, searchType));
    else {
      inputRef.current?.focus();
      return;
    }
    setOpen(false);
    setActiveIndex(-1);
  }
  function keyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (
      autocomplete &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => {
        const count = selectableItems.length;
        if (!count) return -1;
        return event.key === "ArrowDown"
          ? (current + 1) % count
          : current <= 0
            ? count - 1
            : current - 1;
      });
    }
  }
  const surface = "border-n-control bg-white text-n-ink";
  const muted = "text-n-slate";
  const selected = "bg-n-surface";
  return (
    <div ref={containerRef} className="relative min-w-0">
      <form
        action="/search"
        method="get"
        role="search"
        aria-label={
          mode === "hero"
            ? "Find your creator profile"
            : "Search creators and categories"
        }
        onSubmit={submit}
      >
        {searchType !== "all" && (
          <input type="hidden" name="type" value={searchType} />
        )}
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-2 rounded-lg border transition-colors focus-within:ring-2 focus-within:ring-n-red",
            surface,
            mode === "hero" ? "p-2 sm:flex-nowrap" : "h-11 px-3",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <svg
              className={cn(
                "h-5 w-5 shrink-0",
                mode === "hero" && "ml-2",
                muted,
              )}
              aria-hidden
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path
                strokeLinecap="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={inputRef}
              id={`${id}-input`}
              name="q"
              type="search"
              value={query}
              autoComplete="off"
              autoFocus={autoFocus}
              aria-label={
                mode === "hero"
                  ? "Your creator name or username"
                  : "Search creators and categories"
              }
              role={autocomplete ? "combobox" : undefined}
              aria-autocomplete={autocomplete ? "list" : undefined}
              aria-expanded={autocomplete ? showDropdown : undefined}
              aria-controls={showDropdown ? `${id}-results` : undefined}
              aria-activedescendant={
                showDropdown && selectableItems[activeIndex]
                  ? `${id}-option-${activeIndex}`
                  : undefined
              }
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={keyDown}
              placeholder={
                mode === "hero"
                  ? "Your creator name…"
                  : "Search creators & categories…"
              }
              className={cn(
                "min-w-0 w-full bg-transparent py-2 outline-none [&::-webkit-search-cancel-button]:hidden",
                "text-n-ink placeholder:text-n-slate",
                mode === "compact" ? "text-sm" : "text-base",
              )}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setOpen(false);
                  setActiveIndex(-1);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center text-xl",
                  muted,
                )}
              >
                ×
              </button>
            )}
          </div>
          {mode === "hero" && (
            <button
              type="submit"
              className="n-button n-button-primary w-full !rounded-md !px-4 sm:w-auto"
            >
              Find my media kit
            </button>
          )}
        </div>
      </form>
      {showDropdown && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(60vh,480px)] overflow-y-auto rounded-lg border shadow-xl",
            surface,
          )}
        >
          {pending && (
            <p role="status" className={cn("px-4 py-5 text-sm", muted)}>
              Searching…
            </p>
          )}
          {!pending && isError && (
            <p role="status" className={cn("px-4 py-5 text-sm", muted)}>
              Search is temporarily unavailable. Try again or open the full
              results.
            </p>
          )}
          {!pending && !isError && !items.length && (
            <p role="status" className={cn("px-4 py-5 text-sm", muted)}>
              No tracked matches for “{debouncedQuery}”. Open the full search to
              check for untracked channels.
            </p>
          )}
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Search suggestions"
            aria-busy={pending}
          >
            {!pending &&
              !isError &&
              items.map((item, index) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  id={`${id}-option-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  href={item.href}
                  onClick={() => {
                    setOpen(false);
                    setActiveIndex(-1);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3",
                    "hover:bg-n-surface",
                    activeIndex === index && selected,
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-n-surface font-bold text-n-ink",
                      item.type === "creator" && "rounded-full",
                    )}
                  >
                    {item.type === "game" ? (
                      <GameCoverImage
                        src={item.image}
                        name={item.name}
                        sizes="36px"
                        className="object-cover"
                        fallbackClassName="[&>span]:hidden"
                      />
                    ) : getSafeImageSrc(item.image) ? (
                      <Image
                        src={getSafeImageSrc(item.image)!}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    ) : (
                      item.name.charAt(0)
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {item.name}
                    </span>
                    <span className={cn("text-xs", muted)}>
                      {item.type === "creator" ? "Creator" : "Category"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-xs", muted)}>
                    {item.metric}
                  </span>
                </Link>
              ))}
          </div>
          <Link
            href={buildSearchUrl(trimmedQuery, searchType)}
            onClick={() => setOpen(false)}
            className={cn(
              "block border-t px-4 py-3 text-center text-sm font-semibold",
              "border-n-line text-n-red hover:bg-n-surface",
            )}
          >
            View all results
          </Link>
        </div>
      )}
    </div>
  );
}
