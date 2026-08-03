import {
  byCategory,
  closing,
  income,
  spend,
  trough,
  type Ledger,
} from "./ledger";
import type { EconomyCell } from "./sweep";

/**
 * The sweep as something a person can read. Test tooling: a failing
 * bound prints the table beside it, so the first thing anybody sees
 * when the economy drifts is which column moved.
 */

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value;
}

/** One run's flows, one category per line. */
export function ledgerReport(ledger: Ledger): string {
  const rows = byCategory(ledger).map((row) => [
    pad(row.category, 10),
    padLeft(row.net > 0 ? `+${row.net}` : `${row.net}`, 7),
    padLeft(`${row.events}`, 4),
  ]);
  const totals = [
    pad("— in", 10),
    padLeft(`+${income(ledger)}`, 7),
    padLeft("", 4),
  ];
  const out = [
    pad("flow", 10) + padLeft("net", 7) + padLeft("n", 4),
    ...rows.map((row) => row.join("")),
    totals.join(""),
    [pad("— out", 10), padLeft(`-${spend(ledger)}`, 7), padLeft("", 4)].join(""),
    [
      pad("— held", 10),
      padLeft(`${closing(ledger)}`, 7),
      padLeft(`↓${trough(ledger)}`, 6),
    ].join(""),
  ];
  return out.join("\n");
}

/** The whole sweep: one line per cell, plus each cell's flows. */
export function sweepReport(cells: readonly EconomyCell[]): string {
  return cells
    .map(
      (cell) =>
        `${cell.playthroughId} / ${cell.profileId} ` +
        `(${cell.backgroundId})\n${ledgerReport(cell.ledger)}`,
    )
    .join("\n\n");
}

/** One line per cell, for a bound that failed on the shape of the table. */
export function sweepSummary(cells: readonly EconomyCell[]): string {
  const header =
    pad("run", 20) + pad("profile", 19) + padLeft("in", 7) + padLeft("out", 7) +
    padLeft("held", 7) + padLeft("low", 6);
  const rows = cells.map((cell) =>
    [
      pad(cell.playthroughId, 20),
      pad(cell.profileId, 19),
      padLeft(`${income(cell.ledger)}`, 7),
      padLeft(`${spend(cell.ledger)}`, 7),
      padLeft(`${closing(cell.ledger)}`, 7),
      padLeft(`${trough(cell.ledger)}`, 6),
    ].join(""),
  );
  return [header, ...rows].join("\n");
}
