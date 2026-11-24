"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

type Props = {
  genres: string[];
};

export function GenreFilter({ genres }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeGenre = searchParams.get("genre") ?? "";

  function handleSelect(genre: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (genre) {
      params.set("genre", genre);
    } else {
      params.delete("genre");
    }
    params.delete("page");
    router.push(`/browse?${params.toString()}`);
  }

  if (genres.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="Game genre"
      className="flex gap-2 overflow-x-auto pb-2"
    >
      <button
        onClick={() => handleSelect("")}
        aria-pressed={!activeGenre}
        className={cn(
          "min-h-11 flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
          !activeGenre
            ? "border-n-ink bg-n-ink text-white"
            : "border-n-line bg-white text-n-slate hover:border-n-ink hover:text-n-ink",
        )}
      >
        All genres
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          onClick={() => handleSelect(genre)}
          aria-pressed={activeGenre === genre}
          className={cn(
            "min-h-11 flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            activeGenre === genre
              ? "border-n-ink bg-n-ink text-white"
              : "border-n-line bg-white text-n-slate hover:border-n-ink hover:text-n-ink",
          )}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
