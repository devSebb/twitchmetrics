import type { Vertical } from "@twitchmetrics/database";

export const VERTICAL_LABELS: Record<Vertical, string> = {
  gaming: "Gaming",
  irl: "IRL",
  music: "Music",
  creative: "Creative",
  sports: "Sports",
  other: "Other",
};

export const VERTICAL_ORDER: readonly Vertical[] = [
  "gaming",
  "irl",
  "music",
  "creative",
  "sports",
  "other",
] as const;

export const NON_GAME_CATEGORIES: Record<string, Vertical> = {
  IRL: "irl",
  "Just Chatting": "irl",
  "Pools, Hot Tubs, and Beaches": "irl",
  ASMR: "irl",
  "Talk Shows & Podcasts": "irl",
  "Travel & Outdoors": "irl",
  "Food & Drink": "irl",
  "Animals, Aquariums, and Zoos": "irl",
  "Beauty & Body Art": "irl",
  Politics: "irl",
  "Special Events": "irl",
  "Co-working & Studying": "irl",
  Music: "music",
  DJs: "music",
  Art: "creative",
  "Makers & Crafting": "creative",
  "Software and Game Development": "creative",
  "Science & Technology": "creative",
  "Writing & Reading": "creative",
  "Tabletop RPGs": "creative",
  Sports: "sports",
  Chess: "sports",
  Poker: "sports",
  "Fitness & Health": "sports",
  Slots: "sports",
  "Virtual Casino": "sports",
  "Kings League": "sports",
};

type GameForClassify = {
  name: string;
  igdbId: number | null;
};

export function classifyVertical(game: GameForClassify): Vertical {
  const override = NON_GAME_CATEGORIES[game.name];
  if (override) return override;
  if (game.igdbId !== null) return "gaming";
  return "gaming";
}
