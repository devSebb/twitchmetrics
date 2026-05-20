/**
 * RFC 4180-compatible CSV helpers. Only quote fields that need it; double
 * any embedded quotes. Empty/nullish values become empty strings.
 */
export function escapeCsvField(value: unknown): string {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n") ||
    stringValue.includes("\r")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

export function csvRow(...cells: unknown[]): string {
  return cells.map(escapeCsvField).join(",");
}

export function buildCsv(
  headers: readonly string[],
  rows: readonly unknown[][],
): string {
  return [csvRow(...headers), ...rows.map((cells) => csvRow(...cells))].join(
    "\r\n",
  );
}

export function isoOrEmpty(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
