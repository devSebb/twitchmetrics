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
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
      <button
        onClick={() => handleSelect("")}
        className={cn(
          "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
          !activeGenre
            ? "bg-[#E32C19] text-white"
            : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]",
        )}
      >
        All
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          onClick={() => handleSelect(genre)}
          className={cn(
            "flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeGenre === genre
              ? "bg-[#E32C19] text-white"
              : "bg-[#383A40] text-[#949BA4] hover:text-[#DBDEE1]",
          )}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
