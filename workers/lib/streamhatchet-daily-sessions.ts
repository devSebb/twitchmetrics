import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DailySessionPlatform =
  | "kick"
  | "twitch"
  | "yt"
  | "ytg"
  | "facebook";

export type S3ObjectMetadata = {
  bucket: string;
  key: string;
  etag: string | null;
  size: bigint | null;
  lastModified: Date | null;
};

export type StreamHatchetDailySession = {
  source: "streamhatchet";
  platform: DailySessionPlatform;
  platformUserId: string;
  platformVideoId: string | null;
  platformUsername: string;
  platformDisplayName: string | null;
  platformLogoUrl: string | null;
  country: string | null;
  partitionDate: Date;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  peakViewersAt: Date | null;
  sessionTitle: string | null;
  primaryGameName: string | null;
  allGameNames: string[];
  airtimeMinutes: number;
  minutesWatched: bigint;
  sessionViews: bigint | null;
  averageViewers: number;
  averageViewersGlobal: number | null;
  peakViewers: number;
  share: number | null;
  shareCrossPlatform: number | null;
  bestRank: number | null;
  averageRank: number | null;
  worstRank: number | null;
  aggregation: string;
  rawData: unknown | null;
  contentLabel: unknown | null;
  rowHash: string;
};

type AwsOptions = {
  profile: string;
  region?: string;
};

function awsBaseArgs(options: AwsOptions): string[] {
  const args = ["--profile", options.profile];
  if (options.region) args.push("--region", options.region);
  return args;
}

async function runAwsJson<T>(args: string[], options: AwsOptions): Promise<T> {
  const { stdout } = await execFileAsync("aws", [
    ...args,
    ...awsBaseArgs(options),
    "--output",
    "json",
  ]);
  return JSON.parse(stdout) as T;
}

export function buildDailySessionKey(
  prefix: string,
  date: Date,
  platform: DailySessionPlatform,
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, "");
  return `${cleanPrefix}/year=${year}/month=${month}/day=${day}/${platform}/basic.csv`;
}

export async function headS3Object(
  bucket: string,
  key: string,
  options: AwsOptions,
): Promise<S3ObjectMetadata> {
  const json = await runAwsJson<{
    ETag?: string;
    ContentLength?: number;
    LastModified?: string;
  }>(["s3api", "head-object", "--bucket", bucket, "--key", key], options);

  return {
    bucket,
    key,
    etag: json.ETag?.replace(/^"|"$/g, "") ?? null,
    size:
      typeof json.ContentLength === "number"
        ? BigInt(json.ContentLength)
        : null,
    lastModified: json.LastModified ? new Date(json.LastModified) : null,
  };
}

export async function countS3CsvRows(
  bucket: string,
  key: string,
  options: AwsOptions,
): Promise<number | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "streamhatchet-select-"));
  const outputPath = path.join(dir, "count.csv");

  try {
    await execFileAsync("aws", [
      "s3api",
      "select-object-content",
      "--bucket",
      bucket,
      "--key",
      key,
      "--expression",
      "SELECT count(*) FROM S3Object s",
      "--expression-type",
      "SQL",
      "--input-serialization",
      "CSV={FileHeaderInfo=USE}",
      "--output-serialization",
      "CSV={}",
      ...awsBaseArgs(options),
      outputPath,
    ]);

    const { readFile } = await import("node:fs/promises");
    const raw = (await readFile(outputPath, "utf8")).trim();
    const count = Number.parseInt(raw, 10);
    return Number.isFinite(count) ? count : null;
  } catch {
    return null;
  }
}

export async function downloadS3Object(
  bucket: string,
  key: string,
  options: AwsOptions,
): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "streamhatchet-object-"));
  const outputPath = path.join(dir, path.basename(key));

  await execFileAsync("aws", [
    "s3api",
    "get-object",
    "--bucket",
    bucket,
    "--key",
    key,
    ...awsBaseArgs(options),
    outputPath,
  ]);

  return outputPath;
}

function isCsvRecordComplete(record: string): boolean {
  let inQuotes = false;
  for (let i = 0; i < record.length; i++) {
    const ch = record[i];
    if (ch !== '"') continue;
    if (inQuotes && record[i + 1] === '"') {
      i++;
      continue;
    }
    inQuotes = !inQuotes;
  }
  return !inQuotes;
}

function parseCsvRecord(record: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < record.length; i++) {
    const ch = record[i];

    if (inQuotes) {
      if (ch === '"' && record[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === ",") {
      out.push(field);
      field = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      field += ch;
    }
  }

  out.push(field);
  return out;
}

function parseNullableString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseNumberValue(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntValue(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBigIntValue(value: string | undefined): bigint | null {
  if (!value || value.trim() === "") return null;
  try {
    return BigInt(Math.round(Number(value)));
  } catch {
    return null;
  }
}

function parseEpochSeconds(value: string | undefined): Date | null {
  const seconds = parseIntValue(value);
  return seconds !== null ? new Date(seconds * 1000) : null;
}

function parseJsonValue(value: string | undefined): unknown | null {
  if (!value || value.trim() === "") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function extractGames(rawData: unknown): string[] {
  if (!rawData || typeof rawData !== "object") return [];
  const games = (rawData as { games?: unknown }).games;
  if (!Array.isArray(games)) return [];
  return games
    .filter((game): game is string => typeof game === "string")
    .map((game) => game.trim())
    .filter(Boolean);
}

function hashSession(input: {
  platform: DailySessionPlatform;
  platformUserId: string;
  platformVideoId: string | null;
  streamBeginsAt: Date;
  streamEndsAt: Date;
  minutesWatched: bigint;
  airtimeMinutes: number;
  peakViewers: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        platform: input.platform,
        platformUserId: input.platformUserId,
        platformVideoId: input.platformVideoId,
        streamBeginsAt: input.streamBeginsAt.toISOString(),
        streamEndsAt: input.streamEndsAt.toISOString(),
        minutesWatched: input.minutesWatched.toString(),
        airtimeMinutes: input.airtimeMinutes,
        peakViewers: input.peakViewers,
      }),
    )
    .digest("hex");
}

function normalizeRow(
  row: Record<string, string>,
  platform: DailySessionPlatform,
  partitionDate: Date,
): StreamHatchetDailySession | null {
  const platformUserId = parseNullableString(row.user_id);
  const username = parseNullableString(row.username);
  const streamBeginsAt = parseEpochSeconds(row.stream_begins);
  const streamEndsAt = parseEpochSeconds(row.stream_ends);
  const minutesWatched = parseBigIntValue(row.minutes_watched);
  const airtimeMinutes = parseIntValue(row.airtime_minutes);
  const averageViewers = parseNumberValue(row.average_viewers);
  const peakViewers = parseIntValue(row.peak_viewers);

  if (
    !platformUserId ||
    !username ||
    !streamBeginsAt ||
    !streamEndsAt ||
    minutesWatched === null ||
    airtimeMinutes === null ||
    averageViewers === null ||
    peakViewers === null
  ) {
    return null;
  }

  const rawData = parseJsonValue(row.data);
  const games = extractGames(rawData);
  const primaryGameName =
    parseNullableString(row.primary_game) ?? games[0] ?? null;
  const platformVideoId = parseNullableString(row.video_id);

  const session = {
    source: "streamhatchet" as const,
    platform,
    platformUserId,
    platformVideoId,
    platformUsername: username,
    platformDisplayName: parseNullableString(row.display_name),
    platformLogoUrl: parseNullableString(row.logo),
    country: parseNullableString(row.country),
    partitionDate,
    streamBeginsAt,
    streamEndsAt,
    peakViewersAt: parseEpochSeconds(row.timestamp_peak_viewers),
    sessionTitle: parseNullableString(row.session_title),
    primaryGameName,
    allGameNames: games,
    airtimeMinutes,
    minutesWatched,
    sessionViews: parseBigIntValue(row.session_views),
    averageViewers,
    averageViewersGlobal: parseNumberValue(row.average_viewers_global),
    peakViewers,
    share: parseNumberValue(row.share),
    shareCrossPlatform: parseNumberValue(row.share_cross_platform),
    bestRank: parseIntValue(row.max_rank),
    averageRank: parseNumberValue(row.avg_rank),
    worstRank: parseIntValue(row.min_rank),
    aggregation: parseNullableString(row.aggregation) ?? "basic",
    rawData,
    contentLabel: parseJsonValue(row.content_label),
    rowHash: "",
  };

  return {
    ...session,
    rowHash: hashSession(session),
  };
}

export async function parseDailySessionCsv(input: {
  filePath: string;
  platform: DailySessionPlatform;
  partitionDate: Date;
  rowLimit?: number;
  onSession: (session: StreamHatchetDailySession) => Promise<void> | void;
}): Promise<{
  rowsScanned: number;
  rowsAccepted: number;
  rowsRejected: number;
}> {
  const stream = createReadStream(input.filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  let pending = "";
  let rowsScanned = 0;
  let rowsAccepted = 0;
  let rowsRejected = 0;

  for await (const line of rl) {
    pending = pending ? `${pending}\n${line}` : line;
    if (!isCsvRecordComplete(pending)) continue;

    const cells = parseCsvRecord(pending);
    pending = "";

    if (!header) {
      header = cells;
      continue;
    }

    if (input.rowLimit && rowsScanned >= input.rowLimit) break;
    rowsScanned++;

    const row = Object.fromEntries(
      header.map((column, index) => [column, cells[index] ?? ""]),
    );
    const session = normalizeRow(row, input.platform, input.partitionDate);

    if (!session) {
      rowsRejected++;
      continue;
    }

    await input.onSession(session);
    rowsAccepted++;
  }

  return { rowsScanned, rowsAccepted, rowsRejected };
}
