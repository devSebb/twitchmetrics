"use client";

import { useEffect, useRef, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Fetch
  useEffect(() => {
    if (!debounced || disabled) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const type = kind === "games" ? "games" : "creators";
    fetch(`/api/search?q=${encodeURIComponent(debounced)}&type=${type}`)
      .then((r) => r.json())
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
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, kind, disabled]);

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
    <div ref={containerRef} className="relative">
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#E32C19]/15 px-2 py-1 text-xs text-[#F2F3F5]"
            >
              {s.label}
              <button
                type="button"
                onClick={() => removeChip(s.id)}
                className="text-[#E32C19] hover:text-[#F2F3F5]"
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
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[#4E5058]"
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
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[#3F4147] bg-[#383A40] py-2 pl-8 pr-3 text-sm text-[#DBDEE1] placeholder-[#4E5058] outline-none transition-colors focus:border-[#E32C19]/50 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {open && !disabled && (query.trim().length > 0 || loading) && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-[#3F4147] bg-[#2B2D31] shadow-xl">
          {loading && results.length === 0 && (
            <div className="px-3 py-3 text-xs text-[#4E5058]">Searching…</div>
          )}
          {!loading && results.length === 0 && debounced && (
            <div className="px-3 py-3 text-xs text-[#4E5058]">
              No indexed {kind} match “{debounced}”.
            </div>
          )}
          {results.map((r) => {
            const checked = selected.some((s) => s.id === r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggle(r)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-[#383A40]"
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    checked
                      ? "border-[#E32C19] bg-[#E32C19]"
                      : "border-[#4E5058] bg-[#2B2D31]"
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
                  <div className="h-6 w-6 shrink-0 rounded bg-[#383A40]" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm text-[#DBDEE1]">
                    {r.label}
                  </div>
                  {r.sublabel && (
                    <div className="truncate text-[10px] text-[#4E5058]">
                      {r.sublabel}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
