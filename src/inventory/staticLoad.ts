import type { CharacterState } from "../character/create";
import type { Stats } from "../character/stats";
import { requireItem } from "../data/items";
import {
  STATIC_BANDS_TABLE,
  staticBandRank,
  type StaticBand,
  type StaticBandDef,
  type StaticBandEffects,
} from "../data/static";
import type { EnhancementSlot, Item, ItemResolver } from "./items";
import { effectiveStats } from "./selectors";

/**
 * Static derivation: how much noise a loadout is making, and what band
 * that reads as.
 *
 * Nothing here is stored. The level is a pure sum over the enhancements
 * currently installed — exactly like effectiveStats is a pure fold over
 * the same slots — so a save written before Static existed derives a
 * band the moment it loads, and no migration has to guess one. Ripping
 * an implant out lowers the noise by arithmetic rather than by
 * bookkeeping, which is the whole reason to derive it.
 *
 * Content (the band floors, the labels, and what each band costs) lives
 * in src/data/static.ts. This module is the join.
 */

/** The Static a single item contributes; anything but an implant is silent. */
export function staticLoadOf(item: Item): number {
  return item.kind === "enhancement" ? item.staticLoad : 0;
}

/**
 * True for an implant that exists to quiet the others. A dampener is
 * not a separate item kind — it is an enhancement whose Static load is
 * negative, which is what makes it cost a slot and a share of neural
 * capacity like everything else. That cost is the choice: a collar in
 * the neural socket is a coprocessor you are not wearing.
 */
export function isDampener(item: Item): boolean {
  return staticLoadOf(item) < 0;
}

/** Every enhancement currently installed, in slot order. */
function installedEnhancements(
  character: CharacterState,
  resolve: ItemResolver,
): Item[] {
  return Object.values(character.equipment.enhancements)
    .filter((id): id is string => id != null)
    .map(resolve);
}

/**
 * Static from a set of loads. Floored at zero: a runner carrying
 * nothing but dampeners is quiet, not quieter than quiet, and the floor
 * is what keeps the band table total (its first entry sits at 0).
 */
export function totalStatic(loads: readonly number[]): number {
  return Math.max(
    0,
    loads.reduce((sum, load) => sum + load, 0),
  );
}

/**
 * The signed sum of everything installed, floor and all *not* applied.
 *
 * The floor is a presentation rule, and applying it early breaks
 * arithmetic: a runner wearing nothing but dampeners reads 0 while
 * genuinely sitting below it, and a preview that started from the 0
 * would report pulling one of them as a rise. Every projection works
 * from this figure and floors once, at the end.
 */
function rawStatic(character: CharacterState, resolve: ItemResolver): number {
  return installedEnhancements(character, resolve)
    .map(staticLoadOf)
    .reduce((sum, load) => sum + load, 0);
}

/** The Static level of everything installed right now. */
export function staticLevel(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): number {
  return totalStatic([rawStatic(character, resolve)]);
}

/** A level, the band it reads as, and what that band does. */
export interface StaticReading {
  readonly level: number;
  readonly band: StaticBand;
  readonly def: StaticBandDef;
}

/**
 * The band a level reads as: the last band whose floor it clears. Total
 * over every level, including the ones no loadout can reach, so an
 * unclamped number still names a band rather than throwing.
 */
export function readStatic(level: number): StaticReading {
  let def = STATIC_BANDS_TABLE[0]!;
  for (const candidate of STATIC_BANDS_TABLE) {
    if (level >= candidate.min) def = candidate;
  }
  return { level, band: def.id, def };
}

/** What the character screen reads off the current installs. */
export function staticReading(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): StaticReading {
  return readStatic(staticLevel(character, resolve));
}

/** What the current band costs; the effects table, never a band id. */
export function staticEffects(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): StaticBandEffects {
  return staticReading(character, resolve).def.effects;
}

/**
 * Whether a reading is at (or past) a band, or at most it. The
 * comparison is on rungs rather than levels, so content asking for
 * "loud or worse" keeps meaning that through a retune of the floors.
 */
export function meetsStaticBand(
  band: StaticBand,
  required: StaticBand,
  mode: "at-least" | "at-most" = "at-least",
): boolean {
  const have = staticBandRank(band);
  const want = staticBandRank(required);
  return mode === "at-most" ? have <= want : have >= want;
}

/** A move from one reading to another, as an install screen shows it. */
export interface StaticShift {
  readonly from: StaticReading;
  readonly to: StaticReading;
  /** Points the move adds (negative for a dampener). */
  readonly delta: number;
  /** True when the move crosses into a different band. */
  readonly bandChanges: boolean;
}

function shift(from: StaticReading, to: StaticReading): StaticShift {
  return {
    from,
    to,
    delta: to.level - from.level,
    bandChanges: from.band !== to.band,
  };
}

/**
 * What installing this implant would do to the noise — the projection
 * an install button quotes before anybody commits. Asked of Static
 * only: whether the install is *allowed* (a slot already full, capacity
 * spent) stays installEnhancement's question, and a refused install
 * simply never happens.
 */
export function previewInstall(
  character: CharacterState,
  itemId: string,
  resolve: ItemResolver = requireItem,
): StaticShift {
  const from = staticReading(character, resolve);
  const load = staticLoadOf(resolve(itemId));
  return shift(
    from,
    readStatic(totalStatic([rawStatic(character, resolve), load])),
  );
}

/**
 * And the other direction: what ripping the implant out of a slot would
 * leave behind. An empty slot shifts nothing.
 */
export function previewUninstall(
  character: CharacterState,
  slot: EnhancementSlot,
  resolve: ItemResolver = requireItem,
): StaticShift {
  const from = staticReading(character, resolve);
  const itemId = character.equipment.enhancements[slot];
  if (itemId == null) return shift(from, from);
  const load = staticLoadOf(resolve(itemId));
  return shift(
    from,
    readStatic(totalStatic([rawStatic(character, resolve), -load])),
  );
}

/**
 * Effective stats as a *conversation* reads them: the loadout's own
 * figures with the Static band's Cool penalty taken off the top.
 *
 * Deliberately not effectiveStats. Noise costs composure and nothing
 * else — the fight snapshots effectiveStats unchanged, so a screaming
 * runner shoots exactly as straight as a clear one and is only worse
 * at being listened to. Clamped at 1 like every other stat read, so a
 * penalty can shorten a sentence but never erase a person.
 */
export function dialogueStats(
  character: CharacterState,
  resolve: ItemResolver = requireItem,
): Stats {
  const stats = effectiveStats(character, resolve);
  const penalty = staticEffects(character, resolve).coolPenalty;
  if (penalty === 0) return stats;
  return { ...stats, cool: Math.max(1, stats.cool - penalty) };
}
