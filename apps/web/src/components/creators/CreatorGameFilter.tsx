"use client";

import { useSearchParams } from "next/navigation";
import { useCreatorNavigation } from "./CreatorNavigation";

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
  const { navigate, choice } = useCreatorNavigation();
  const searchParams = useSearchParams();
  const active = choice.game ?? activeGame?.slug ?? "";

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
    navigate(next ? `/creators?${next}` : "/creators", { game: value });
  }

  return (
    <select
      value={active}
      onChange={(event) => handleChange(event.target.value)}
      aria-label="Filter by game"
      className="n-input !w-auto max-w-full truncate sm:max-w-[240px]"
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
