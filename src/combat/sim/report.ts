import { aggregate, groupBy, type Aggregate, type SweepCell } from "./sweep";

/**
 * Printing the sweep. Plain text tables, because the artifact this
 * produces is meant to be read in a terminal beside a failing assertion
 * and pasted into a note — not parsed.
 *
 * Every table is a fold of the same cells, so the report never says
 * anything the assertions cannot also check: what you read is what CI
 * is guarding.
 */

function pct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function fixed(value: number, places = 1): string {
  return value.toFixed(places);
}

function pad(value: string, width: number, right = false): string {
  return right ? value.padStart(width) : value.padEnd(width);
}

export interface TableColumn<T> {
  header: string;
  /** Numbers read better hard against the column edge. */
  align?: "left" | "right";
  cell(row: T): string;
}

/** A fixed-width table with a rule under the header. */
export function formatTable<T>(
  columns: readonly TableColumn<T>[],
  rows: readonly T[],
): string {
  const body = rows.map((row) => columns.map((column) => column.cell(row)));
  const widths = columns.map((column, index) =>
    Math.max(column.header.length, ...body.map((cells) => cells[index]!.length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) =>
        pad(cell, widths[index]!, columns[index]!.align === "right"),
      )
      .join("  ")
      .trimEnd();
  return [
    line(columns.map((column) => column.header)),
    line(widths.map((width) => "-".repeat(width))),
    ...body.map(line),
  ].join("\n");
}

/** One folded group with the label it was grouped under. */
export interface LabelledAggregate {
  label: string;
  stats: Aggregate;
}

export function foldBy(
  cells: readonly SweepCell[],
  key: (cell: SweepCell) => string,
): LabelledAggregate[] {
  return [...groupBy(cells, key)].map(([label, group]) => ({
    label,
    stats: aggregate(group),
  }));
}

/**
 * The standard columns: what everything the sweep measures is read
 * through. "worst" is the single least successful cell inside the group,
 * which is the figure the "no build is hard-gated" target is about — a
 * group can average 90% while one build inside it never wins at all.
 */
export function aggregateTable(
  rows: readonly LabelledAggregate[],
  labelHeader: string,
): string {
  return formatTable<LabelledAggregate>(
    [
      { header: labelHeader, cell: (row) => row.label },
      { header: "win", align: "right", cell: (row) => pct(row.stats.winRate) },
      {
        header: "worst",
        align: "right",
        cell: (row) => pct(row.stats.worstCellWinRate),
      },
      {
        header: "rounds",
        align: "right",
        cell: (row) => fixed(row.stats.meanRounds),
      },
      {
        header: "hp left",
        align: "right",
        cell: (row) => pct(row.stats.meanHealthLeft),
      },
      {
        header: "items",
        align: "right",
        cell: (row) => fixed(row.stats.meanItemsUsed, 2),
      },
      {
        header: "stalls",
        align: "right",
        cell: (row) => String(row.stats.stalls),
      },
      {
        header: "n",
        align: "right",
        cell: (row) => String(row.stats.battles),
      },
    ],
    rows,
  );
}

/** A titled block, for a console the reader is scrolling through. */
export function section(title: string, body: string): string {
  return `\n${title}\n${"=".repeat(title.length)}\n${body}\n`;
}
