"use client";

import { useEffect, useRef, useState, useId } from "react";

type Entity = {
  id: string;
  label: string;
  sublabel?: string;
  imageUrl?: string | null;
};

type CreatorRow = {
  id: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
};

type GameRow = {
  id: string;
  name: string;
  slug: string;
  coverImageUrl: string | null;
};

type Props = {
  kind: "games" | "channels";
  disabled: boolean;
  disabledReason?: string | undefined;
  selected: Entity[];
  onChange: (next: Entity[]) => void;
};

export function EntityPicker({
  kind,
  disabled,
  disabledReason,
  selected,
  onChange,
}: Props) {
  const id = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // A result belongs to its completed query. Hide it as soon as typing resumes,
  // including during the debounce, so Enter cannot select a stale suggestion.
  const searching = loading || query.trim() !== debounced;
  const visibleResults = searching ? [] : results;

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch
  useEffect(() => {
    if (!debounced || disabled) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setActiveIndex(-1);
    const type = kind === "games" ? "games" : "creators";
    fetch(`/api/search?q=${encodeURIComponent(debounced)}&type=${type}`)
      .then((r) => {
        if (!r.ok) throw new Error("Search unavailable");
        return r.json();
      })
      .then(
        (data: { data?: { creators?: CreatorRow[]; games?: GameRow[] } }) => {
          if (cancelled) return;
          const rows: Entity[] =
            kind === "games"
              ? (data.data?.games ?? []).map((g) => ({
                  id: g.id,
                  label: g.name,
                  sublabel: g.slug,
                  imageUrl: g.coverImageUrl,
                }))
              : (data.data?.creators ?? []).map((c) => ({
                  id: c.id,
                  label: c.displayName,
                  sublabel: c.slug,
                  imageUrl: c.avatarUrl,
                }));
          setResults(rows);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setResults([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, kind, disabled, retry]);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle(row: Entity) {
    const exists = selected.some((s) => s.id === row.id);
    onChange(
      exists ? selected.filter((s) => s.id !== row.id) : [...selected, row],
    );
  }

  function removeChip(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  const placeholder = disabled
    ? (disabledReason ?? "Disabled")
    : kind === "games"
      ? "Search games by name…"
      : "Search channels by name…";

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-n-red/15 px-2 py-1 text-xs text-n-ink"
            >
              {s.label}
              <button
                type="button"
                onClick={() => removeChip(s.id)}
                className="flex h-11 w-11 items-center justify-center text-n-red hover:text-n-ink"
                aria-label={`Remove ${s.label}`}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-n-slate"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-label={`Search ${kind}`}
          aria-autocomplete="list"
          aria-expanded={open && !disabled && query.trim().length > 0}
          aria-controls={open ? `${id}-results` : undefined}
          aria-activedescendant={
            open && visibleResults[activeIndex]
              ? `${id}-result-${activeIndex}`
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
            }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (visibleResults.length)
                setActiveIndex((current) =>
                  event.key === "ArrowDown"
                    ? (current + 1) % visibleResults.length
                    : current <= 0
                      ? visibleResults.length - 1
                      : current - 1,
                );
            }
            if (event.key === "Enter" && open && visibleResults[activeIndex]) {
              event.preventDefault();
              toggle(visibleResults[activeIndex]!);
            }
          }}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-n-line bg-n-surface py-2 pl-8 pr-3 text-sm text-n-ink placeholder-n-slate outline-none transition-colors focus:border-n-red/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {open && !disabled && (query.trim().length > 0 || loading) && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-n-line bg-n-surface shadow-xl">
          {searching && (
            <div className="px-3 py-3 text-xs text-n-slate">Searching…</div>
          )}
          {error && !searching && (
            <p role="alert" className="px-3 py-3 text-sm text-n-error">
              Search could not load.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Try again
              </button>
            </p>
          )}
          {!searching && !error && results.length === 0 && debounced && (
            <div className="px-3 py-3 text-xs text-n-slate">
              No indexed {kind} match “{debounced}”.
            </div>
          )}
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label={`${kind} search results`}
            aria-multiselectable="true"
            aria-busy={searching}
          >
            {visibleResults.map((r, index) => {
              const checked = selected.some((s) => s.id === r.id);
              return (
                <button
                  key={r.id}
                  id={`${id}-result-${index}`}
                  role="option"
                  aria-selected={checked}
                  type="button"
                  onClick={() => toggle(r)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-n-surface ${activeIndex === index ? "bg-n-surface outline outline-1 outline-n-control" : ""}`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? "border-n-red bg-n-red"
                        : "border-n-control bg-n-surface"
                    }`}
                  >
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="h-6 w-6 shrink-0 rounded bg-n-surface" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm text-n-ink">{r.label}</div>
                    {r.sublabel && (
                      <div className="truncate text-[10px] text-n-slate">
                        {r.sublabel}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
