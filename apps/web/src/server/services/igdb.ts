import { createLogger } from "@/lib/logger";
import { getTwitchAppToken } from "@/server/adapters/twitch";

const log = createLogger("igdb");

export type IgdbGame = {
  id: number;
  name: string;
  summary?: string;
  cover?: { url: string };
  genres?: { name: string }[];
  release_dates?: { human: string; date: number }[];
  involved_companies?: {
    developer: boolean;
    publisher: boolean;
    company: { name: string };
  }[];
  platforms?: { name: string }[];
};

async function queryIgdb(body: string): Promise<IgdbGame[]> {
  const token = await getTwitchAppToken();
  const clientId = process.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error("TWITCH_CLIENT_ID must be configured for IGDB queries");
  }

  const response = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    log.warn({ status: response.status, text }, "IGDB query failed");
    return [];
  }

  return (await response.json()) as IgdbGame[];
}

export async function lookupIgdbGameById(
  igdbId: number,
): Promise<IgdbGame | null> {
  const results = await queryIgdb(
    `where id = ${igdbId}; fields name,summary,cover.url,genres.name,release_dates.human,release_dates.date,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,platforms.name; limit 1;`,
  );
  return results[0] ?? null;
}

export async function searchIgdbGameByName(
  gameName: string,
): Promise<IgdbGame | null> {
  const escaped = gameName.replace(/"/g, '\\"');
  const results = await queryIgdb(
    `search "${escaped}"; fields name,summary,cover.url,genres.name,release_dates.human,release_dates.date,involved_companies.developer,involved_companies.publisher,involved_companies.company.name,platforms.name; limit 1;`,
  );
  return results[0] ?? null;
}

export function formatIgdbCoverUrl(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace("//", "https://").replace("t_thumb", "t_cover_big");
}

export function extractDeveloper(
  companies: IgdbGame["involved_companies"],
): string | null {
  if (!companies) return null;
  const developer = companies.find((company) => company.developer);
  return developer?.company.name ?? null;
}

export function extractPublisher(
  companies: IgdbGame["involved_companies"],
): string | null {
  if (!companies) return null;
  const publisher = companies.find((company) => company.publisher);
  return publisher?.company.name ?? null;
}

export function extractReleaseDate(
  dates: IgdbGame["release_dates"],
): Date | null {
  if (!dates || dates.length === 0) return null;
  const first = dates.find((date) => date.date);
  return first ? new Date(first.date * 1000) : null;
}

export function buildGameSearchText(input: {
  name: string;
  developer?: string | null;
  publisher?: string | null;
  genres?: string[];
}) {
  return [
    input.name,
    input.developer ?? null,
    input.publisher ?? null,
    ...(input.genres ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
