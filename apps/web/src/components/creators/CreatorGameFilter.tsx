"use client";

import { useRouter, useSearchParams } from "next/navigation";

type GameOption = { slug: string; name: string };

/**
 * Game filter for /creators, following the same URL-param pattern as the
 * platform pills / sort controls (client control that rewrites searchParams).
 * Rendered as a compact dropdown since the game catalog is too large for
 * pills; the server passes the top games plus the currently active one.
 */
export function CreatorGameFilter({
  games,
  activeGame,
}: {
  games: GameOption[];
  activeGame: GameOption | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = activeGame?.slug ?? "";

  const options =
    activeGame && !games.some((game) => game.slug === activeGame.slug)
      ? [activeGame, ...games]
      : games;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("game", value);
    } else {
      params.delete("game");
    }
    params.delete("page");
    const next = params.toString();
    router.push(next ? `/creators?${next}` : "/creators");
  }

  return (
    <select
      value={active}
      onChange={(event) => handleChange(event.target.value)}
      aria-label="Filter by game"
      className="rounded-md border border-[#3F4147] bg-[#1E1F22] px-3 py-1.5 text-xs font-medium text-[#DBDEE1] outline-none transition-colors hover:border-[#4E5058] focus:border-[#4E5058]"
    >
      <option value="">All games</option>
      {options.map((game) => (
        <option key={game.slug} value={game.slug}>
          {game.name}
        </option>
      ))}
    </select>
  );
}
