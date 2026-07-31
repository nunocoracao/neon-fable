import type { CharacterState } from "../character";
import { STATIC_BANDS_TABLE, type StaticBand } from "../data/static";
import {
  isDampener,
  previewInstall,
  previewUninstall,
  staticReading,
  type EnhancementSlot,
  type ItemResolver,
  type StaticShift,
} from "../inventory";
import { requireItem } from "../data/items";
import { staticEffectNotes, staticLine, staticProjection } from "./format";

/**
 * The Static section, as data. Pure over a character — no DOM, no
 * session — so what the meter reads, what an install is projected to
 * cost, and which band a row lands in are all testable without
 * mounting a screen (the same split ./dyeModel.ts uses for the colour
 * counter and ./workbenchModel.ts for the bench).
 *
 * Every figure comes back through src/inventory/staticLoad.ts, which is
 * the point: the meter on the character screen and the projection on an
 * install button are the same derivation asked twice, so they cannot
 * drift apart and a test can pin them together.
 */

/**
 * The level the meter reads as full: the floor of the worst band. Past
 * it the bar simply stays full — there is no ceiling on Static, and
 * pretending there is one would be the meter lying about the last
 * implant.
 */
export const STATIC_METER_FULL =
  STATIC_BANDS_TABLE[STATIC_BANDS_TABLE.length - 1]?.min ?? 1;

/** The meter and its caption, as the character screen shows them. */
export interface StaticMeterView {
  level: number;
  band: StaticBand;
  /** "Static 6 — Loud". */
  label: string;
  /** What carrying this much noise is like. */
  blurb: string;
  /** What the band is costing, in checkable terms; empty when nothing. */
  notes: string[];
  /** Bar fill in [0, 1]; pinned full at and past the worst band's floor. */
  fill: number;
}

export function staticMeter(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): StaticMeterView {
  const reading = staticReading(character, resolve);
  return {
    level: reading.level,
    band: reading.band,
    label: staticLine(reading),
    blurb: reading.def.blurb,
    notes: staticEffectNotes(reading),
    fill:
      STATIC_METER_FULL > 0
        ? Math.min(1, Math.max(0, reading.level / STATIC_METER_FULL))
        : 0,
  };
}

/** One projected move, as an install or extraction button quotes it. */
export interface StaticPreviewRow {
  /** "+4 Static → 6 · Loud", or "No change to Static". */
  projection: string;
  /** The band the move would land in. */
  band: StaticBand;
  level: number;
  /** True when the move would cross into a different band. */
  bandChanges: boolean;
  /** True when the move makes things quieter — a dampener, or a pull. */
  quiets: boolean;
}

function row(shift: StaticShift): StaticPreviewRow {
  return {
    projection: staticProjection(shift),
    band: shift.to.band,
    level: shift.to.level,
    bandChanges: shift.bandChanges,
    quiets: shift.delta < 0,
  };
}

/**
 * What installing this implant would do to the noise — the line an
 * install button carries before anybody commits to it. Answers for any
 * item id: something that is not an implant projects no change, which
 * is exactly true of it.
 */
export function installPreviewRow(
  character: CharacterState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): StaticPreviewRow {
  return row(previewInstall(character, itemId, resolve));
}

/** And the same line for ripping the implant out of a slot. */
export function uninstallPreviewRow(
  character: CharacterState,
  slot: EnhancementSlot,
  resolve: ItemResolver = requireItem,
): StaticPreviewRow {
  return row(previewUninstall(character, slot, resolve));
}

/** True for an implant carried to quiet the others (see isDampener). */
export function isDampenerId(
  itemId: string,
  resolve: ItemResolver = requireItem,
): boolean {
  return isDampener(resolve(itemId));
}
