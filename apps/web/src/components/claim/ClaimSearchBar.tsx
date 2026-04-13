"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { getSafeImageSrc } from "@/lib/safeImage";
import { trpc } from "@/lib/trpc";

type CreatorResult = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  totalFollowers: string;
  relevance: number;
};

type SearchResponse = {
  data: {
    creators: CreatorResult[];
    games: unknown[];
  };
  meta: { query: string; totalResults: number };
};

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function RegisterChannelForm({
  onRedirect,
}: {
  onRedirect: (profileId: string) => void;
}) {
  const router = useRouter();
  const [twitchLogin, setTwitchLogin] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = trpc.claim.selfRegister.useMutation({
    onSuccess: (result) => {
      if (result.redirect) {
        onRedirect(result.redirect);
        return;
      }
      router.push("/dashboard");
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = twitchLogin.trim();
    if (!trimmed) return;
    mutate({ twitchLogin: trimmed });
  };

  return (
    <div className="mt-6 rounded-lg border border-dashed border-[#3F4147] bg-[#2B2D31] px-5 py-5">
      <p className="text-sm font-medium text-[#DBDEE1]">
        Don&apos;t see your channel?
      </p>
      <p className="mt-0.5 text-xs text-[#949BA4]">
        Enter your Twitch username to register your channel and get it tracked.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-[#3F4147] bg-[#1E1F22] px-3 focus-within:border-[#9146ff]/60">
          <span className="text-xs text-[#949BA4]">twitch.tv/</span>
          <input
            type="text"
            value={twitchLogin}
            onChange={(e) => {
              setTwitchLogin(e.target.value);
              setError(null);
            }}
            placeholder="yourusername"
            maxLength={25}
            pattern="[a-zA-Z0-9_]+"
            className="flex-1 bg-transparent text-sm text-[#DBDEE1] placeholder-[#5C5F66] outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !twitchLogin.trim()}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#9146ff] px-3 text-sm font-medium text-white transition-colors hover:bg-[#7c2ff7] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <svg
              className="h-3.5 w-3.5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : null}
          {isPending ? "Registering..." : "Register"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-[#fca5a5]">{error}</p>}
    </div>
  );
}

export function ClaimSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  const shouldFetch = debouncedQuery.length >= 2;

  const { data, isLoading } = useQuery<SearchResponse>({
    queryKey: ["claim-search", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(debouncedQuery)}&type=creators`,
      );
      return res.json() as Promise<SearchResponse>;
    },
    enabled: shouldFetch,
    staleTime: 30_000,
  });

  const creators = useMemo(() => data?.data.creators ?? [], [data]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        inputRef.current?.blur();
        return;
      }
      if (
        e.key === "Enter" &&
        activeIndex >= 0 &&
        activeIndex < creators.length
      ) {
        const c = creators[activeIndex]!;
        router.push(`/claim?profile=${c.id}`);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => {
          const max = creators.length;
          if (!max) return -1;
          if (e.key === "ArrowDown") return prev < max - 1 ? prev + 1 : 0;
          return prev > 0 ? prev - 1 : max - 1;
        });
      }
    },
    [activeIndex, creators, router],
  );

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg border border-[#3F4147] bg-[#1E1F22] h-11 px-4 transition-colors focus-within:border-[#E32C19]/50">
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
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search for your creator profile..."
          autoFocus
          className="w-full bg-transparent text-base text-[#DBDEE1] placeholder-[#949BA4] outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
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

      {shouldFetch && (
        <div className="mt-4">
          {isLoading && (
            <div className="text-sm text-[#949BA4]">Searching...</div>
          )}

          {!isLoading && creators.length === 0 && (
            <div>
              <div className="rounded-lg border border-[#3F4147] bg-[#313338] px-6 py-6 text-center">
                <p className="text-sm font-medium text-[#DBDEE1]">
                  No creators found for &ldquo;{debouncedQuery}&rdquo;
                </p>
                <p className="mt-1 text-xs text-[#949BA4]">
                  Try a different name or username
                </p>
              </div>
              <RegisterChannelForm
                onRedirect={(profileId) =>
                  router.push(`/dashboard/claim?profile=${profileId}`)
                }
              />
            </div>
          )}

          {!isLoading && creators.length > 0 && (
            <div className="grid gap-2">
              {creators.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/claim?profile=${c.id}`)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border border-[#3F4147] bg-[#313338] p-3 text-left transition-colors hover:border-[#4E5058] hover:bg-[#383A40]",
                    activeIndex === i && "border-[#E32C19]/50 bg-[#383A40]",
                  )}
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
                  <span className="text-xs font-medium text-[#E32C19]">
                    Claim
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
