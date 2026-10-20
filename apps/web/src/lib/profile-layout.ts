import {
  WIDGET_ORDER,
  WIDGET_REGISTRY,
  type WidgetId,
} from "@/lib/constants/widgets";

/**
 * Profile grid packer.
 *
 * Widgets render only when they have data, so a fixed row layout leaves holes
 * (a lone card beside an empty column). Instead, the widgets that will render
 * are packed into 12-column rows in display order: each takes its preferred
 * span, only cards of the same height class share a row, leftover space in a
 * row goes to cards that may grow, and "filler" widgets (Brand Partners) are
 * moved to whichever slot needs the least stretching.
 *
 * Pure: runs on the server for the public profile and again in the browser
 * when an owner toggles widgets.
 */

export const GRID_COLUMNS = 12;

/**
 * Server-checked data availability for widgets that load their data
 * client-side (see server/services/profile-widget-availability.ts).
 */
export type ProfileDataAvailability = {
  popular_games: boolean;
  recent_streams: boolean;
  viewer_count: boolean;
  follower_growth: boolean;
  featured_clips: boolean;
};

export type LayoutCell = { id: WidgetId; span: number };

export type ProfileLayout = {
  /** Full-width widgets above the packed grid, in display order. */
  pinned: WidgetId[];
  rows: LayoutCell[][];
};

type PackedRows = {
  rows: LayoutCell[][];
  /** Columns that had to be filled past a widget's maxSpan to avoid a hole. */
  overflow: number;
  /** Columns non-filler widgets grew past their preferred span. */
  stretch: number;
};

const layoutOf = (id: WidgetId) => WIDGET_REGISTRY[id].layout;

function packRows(sequence: WidgetId[]): PackedRows {
  const rows: LayoutCell[][] = [];
  let overflow = 0;
  let stretch = 0;
  let row: LayoutCell[] = [];
  let rowHeight: string | null = null;
  let used = 0;

  const closeRow = () => {
    let left = GRID_COLUMNS - used;
    // Leftover goes to the last growable card first, up to its maxSpan.
    for (let i = row.length - 1; i >= 0 && left > 0; i--) {
      const cell = row[i]!;
      const add = Math.min(left, layoutOf(cell.id).maxSpan - cell.span);
      cell.span += add;
      left -= add;
      if (!layoutOf(cell.id).filler) stretch += add;
    }
    // Never leave a hole: stretch past maxSpan as a last resort, preferring
    // a non-filler card. The overflow is scored so placements avoid it.
    if (left > 0) {
      const target =
        [...row].reverse().find((cell) => !layoutOf(cell.id).filler) ??
        row[row.length - 1]!;
      target.span += left;
      overflow += left;
    }
    rows.push(row);
    row = [];
    rowHeight = null;
    used = 0;
  };

  for (const id of sequence) {
    const { span, height, filler } = layoutOf(id);
    const heightClash = !filler && rowHeight !== null && rowHeight !== height;
    if (row.length > 0 && (used + span > GRID_COLUMNS || heightClash)) {
      closeRow();
    }
    row.push({ id, span });
    if (!filler) rowHeight = height;
    used += span;
  }
  if (row.length > 0) closeRow();

  return { rows, overflow, stretch };
}

/**
 * Inserts a filler widget at the slot that avoids holes and stretches the
 * other cards least, then prefers its natural position (so Brand Partners
 * stays beside Demographics when both exist), then the earliest slot.
 */
function placeFiller(
  sequence: WidgetId[],
  filler: WidgetId,
  naturalIndex: number,
): WidgetId[] {
  let best: { seq: WidgetId[]; score: number[] } | null = null;
  for (let i = 0; i <= sequence.length; i++) {
    const seq = [...sequence.slice(0, i), filler, ...sequence.slice(i)];
    const { overflow, stretch } = packRows(seq);
    const score = [overflow, stretch, Math.abs(i - naturalIndex), i];
    if (!best || isBetter(score, best.score)) best = { seq, score };
  }
  return best!.seq;
}

/** Lexicographic comparison: earlier entries dominate. */
function isBetter(score: number[], than: number[]): boolean {
  for (let i = 0; i < score.length; i++) {
    if (score[i] !== than[i]) return score[i]! < than[i]!;
  }
  return false;
}

export function packProfileLayout(present: Iterable<WidgetId>): ProfileLayout {
  const presentSet = new Set(present);
  const ordered = WIDGET_ORDER.filter((id) => presentSet.has(id));

  const pinned = ordered.filter((id) => layoutOf(id).pinned);
  let sequence = ordered.filter(
    (id) => !layoutOf(id).pinned && !layoutOf(id).filler,
  );

  for (const filler of ordered.filter((id) => layoutOf(id).filler)) {
    const before = ordered.slice(0, ordered.indexOf(filler));
    const naturalIndex = before.filter((id) => sequence.includes(id)).length;
    sequence = placeFiller(sequence, filler, naturalIndex);
  }

  return { pinned, rows: packRows(sequence).rows };
}
