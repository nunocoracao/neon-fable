/**
 * The sweep's case model: every axis the layered character system can
 * be varied along, built straight from the appearance catalogs and the
 * item data, plus the readable repro string a failing case prints.
 *
 * Fourteen dimensions — the ten appearance categories, the worn outfit,
 * the held weapon, the installed cyberware set, and the dye rubbed into
 * the coat — every value of every one of them sourced from content, so
 * a new catalog entry, outfit, weapon, implant, or tin joins the sweep
 * the moment it is authored and nothing here needs editing.
 *
 * ## Pruning
 *
 * Two kinds of case never reach a render:
 *
 * - Combinations the interaction rules collapse. A tech hood hides the
 *   hair layer, so all nine hair styles under a hood are one picture; a
 *   rebreather covers the eyes, so eye color under one is invisible.
 *   Rather than hard-code those rules a second time, the prune is
 *   `composedCharacterKey`: two cases whose descriptors serialize
 *   identically *are* the same picture, by the same identity the bake
 *   cache trusts. Dropping the duplicate costs nothing and the
 *   collision groups are kept so a test can prove the collapse honest.
 * - Dye values on a bare torso. A tin needs cloth; with no outfit
 *   equipped a dye names channels nothing draws in.
 *
 * Everything here is pure and deterministic — no clock, no canvas.
 */
import {
  appearanceCatalogs,
  type AppearanceCategory,
} from "../../data/appearance";
import { items } from "../../data/items";
import { dyeItems } from "../../data/dyes";
import {
  ENHANCEMENT_SLOTS,
  type EnhancementSlot,
  type OutfitDye,
} from "../../inventory/items";
import type { EquipmentState } from "../../inventory/equipment";
import { composedCharacterKey, type ComposedCharacter } from "../../iso/art/layers";
import {
  APPEARANCE_FIELDS,
  composeCharacter,
  defaultAppearance,
  type Appearance,
  type AppearanceField,
} from "../appearance";
import {
  coverageIndexCases,
  exhaustiveCaseCount,
  perOptionIndexCases,
  valuesOf,
  type IndexCase,
  type SweepDimension,
} from "./combinations";

/** A named cyberware loadout: what is installed in which slot. */
export interface CyberSet {
  readonly id: string;
  readonly enhancements: Partial<Record<EnhancementSlot, string>>;
}

/** A named dye pick: the tin's colors, or nothing at all. */
export interface DyePick {
  readonly id: string;
  readonly dye: OutfitDye | undefined;
}

/** A named gear pick: an item id, or nothing equipped. */
export interface GearPick {
  readonly id: string;
  readonly itemId: string | null;
}

/** Every outfit in the item data that carries a layer, plus bare. */
export function outfitPicks(): GearPick[] {
  return [
    { id: "bare", itemId: null },
    ...items
      .filter((item) => item.kind === "outfit" && item.outfitLayer !== undefined)
      .map((item) => ({ id: item.id, itemId: item.id })),
  ];
}

/** Every weapon in the item data that carries a layer, plus empty hands. */
export function weaponPicks(): GearPick[] {
  return [
    { id: "unarmed", itemId: null },
    ...items
      .filter((item) => item.kind === "weapon" && item.weaponLayer !== undefined)
      .map((item) => ({ id: item.id, itemId: item.id })),
  ];
}

/**
 * The cyberware loadouts: nothing installed, every implant that shows
 * an overlay installed on its own, and one full rack per slot-filling
 * pass over those implants — so multi-overlay composition (several
 * layers stacking in the topmost slot) is swept as well as each
 * overlay alone.
 */
export function cyberSets(): CyberSet[] {
  const visible = items.filter(
    (item) => item.kind === "enhancement" && item.cyberLayer !== undefined,
  );
  const sets: CyberSet[] = [{ id: "none", enhancements: {} }];
  for (const item of visible) {
    if (item.kind !== "enhancement") continue;
    sets.push({ id: item.id, enhancements: { [item.slot]: item.id } });
  }
  // Full racks: pass down the per-slot lists in parallel, so every
  // implant appears in a rack too and the racks differ from each other.
  const bySlot = new Map<EnhancementSlot, string[]>(
    ENHANCEMENT_SLOTS.map((slot) => [slot, []]),
  );
  for (const item of visible) {
    if (item.kind !== "enhancement") continue;
    bySlot.get(item.slot)?.push(item.id);
  }
  const rackCount = Math.max(
    ...ENHANCEMENT_SLOTS.map((slot) => bySlot.get(slot)?.length ?? 0),
  );
  for (let rack = 0; rack < rackCount; rack++) {
    const enhancements: Partial<Record<EnhancementSlot, string>> = {};
    for (const slot of ENHANCEMENT_SLOTS) {
      const ids = bySlot.get(slot) ?? [];
      const id = ids[rack % Math.max(1, ids.length)];
      if (id !== undefined) enhancements[slot] = id;
    }
    sets.push({ id: `rack-${rack}`, enhancements });
  }
  return sets;
}

/** Every tin in the dye data, plus the undyed coat. */
export function dyePicks(): DyePick[] {
  return [
    { id: "undyed", dye: undefined },
    ...dyeItems.map((tin) => ({ id: tin.id, dye: tin.colors })),
  ];
}

/** The non-appearance axes, in the order the case tuple carries them. */
export const GEAR_FIELDS = ["outfit", "weapon", "cyber", "dye"] as const;
export type GearField = (typeof GEAR_FIELDS)[number];

/** A sweep dimension's values are option ids for appearance, picks for gear. */
export type SweepValue = string | GearPick | CyberSet | DyePick;

/**
 * Every dimension of the sweep, appearance categories first (in
 * Appearance field order) then the four gear axes. Values come from the
 * catalogs and the item data; nothing is listed by hand.
 */
export function sweepDimensions(): SweepDimension<SweepValue>[] {
  const appearance = APPEARANCE_FIELDS.map((field) => ({
    name: field as string,
    values: appearanceCatalogs[field as AppearanceCategory].map(
      (option) => option.id,
    ),
  }));
  return [
    ...appearance,
    { name: "outfit", values: outfitPicks() },
    { name: "weapon", values: weaponPicks() },
    { name: "cyber", values: cyberSets() },
    { name: "dye", values: dyePicks() },
  ];
}

/** One swept combination: what to compose, and how to say so out loud. */
export interface SweepCase {
  readonly appearance: Appearance;
  readonly equipment: EquipmentState;
  readonly outfitId: string;
  readonly weaponId: string;
  readonly cyberId: string;
  readonly dyeId: string;
  /** The composed descriptor — resolved once, reused by every assertion. */
  readonly character: ComposedCharacter;
  /** Serialized descriptor: the identity duplicate cases collapse onto. */
  readonly key: string;
}

/** A human-readable repro line naming every axis of a case. */
export function describeCase(sweepCase: SweepCase): string {
  const look = APPEARANCE_FIELDS.map(
    (field) => `${field}=${sweepCase.appearance[field]}`,
  );
  return [
    ...look,
    `outfit=${sweepCase.outfitId}`,
    `weapon=${sweepCase.weaponId}`,
    `cyber=${sweepCase.cyberId}`,
    `dye=${sweepCase.dyeId}`,
  ].join(" ");
}

/** A repro line for one frame of a case. */
export function describeFrame(
  sweepCase: SweepCase,
  facing: string,
  state: string,
  frame: number,
  variant?: string,
): string {
  const pose = variant
    ? `${facing}/${state}:${frame}/${variant}`
    : `${facing}/${state}:${frame}`;
  return `[${pose}] ${describeCase(sweepCase)}`;
}

function asAppearance(values: readonly SweepValue[]): Appearance {
  const appearance = {} as Record<AppearanceField, string>;
  APPEARANCE_FIELDS.forEach((field, i) => {
    const value = values[i];
    if (typeof value !== "string") {
      throw new Error(`dimension ${field} did not yield an option id`);
    }
    appearance[field] = value;
  });
  return appearance as Appearance;
}

function buildCase(values: readonly SweepValue[]): SweepCase {
  const appearance = asAppearance(values);
  const offset = APPEARANCE_FIELDS.length;
  const outfit = values[offset] as GearPick;
  const weapon = values[offset + 1] as GearPick;
  const cyber = values[offset + 2] as CyberSet;
  const dye = values[offset + 3] as DyePick;
  // A tin needs cloth: with nothing worn, the dye axis is not a
  // difference the render can show, so it collapses to undyed.
  const dyed = outfit.itemId === null ? undefined : dye.dye;
  const equipment: EquipmentState = {
    weapon: weapon.itemId,
    outfit: outfit.itemId,
    enhancements: cyber.enhancements,
    ...(dyed ? { outfitDye: dyed } : {}),
  };
  const character = composeCharacter(appearance, equipment);
  return {
    appearance,
    equipment,
    outfitId: outfit.id,
    weaponId: weapon.id,
    cyberId: cyber.id,
    dyeId: dyed ? dye.id : "undyed",
    character,
    key: composedCharacterKey(character),
  };
}

/** The stock look's index in each dimension — the per-option baseline. */
function defaultIndices(
  dimensions: readonly SweepDimension<SweepValue>[],
): number[] {
  const stock = defaultAppearance();
  return dimensions.map((dimension, d) => {
    if (d < APPEARANCE_FIELDS.length) {
      const field = APPEARANCE_FIELDS[d] as AppearanceField;
      const index = dimension.values.indexOf(stock[field]);
      if (index < 0) {
        throw new Error(`default ${field} "${stock[field]}" is not in its catalog`);
      }
      return index;
    }
    // Gear axes default to nothing equipped — one thing at a time —
    // except the outfit, which defaults to the first coat in the item
    // data. A tin of dye needs cloth: with a bare torso the whole dye
    // axis would collapse onto the undyed case and never be swept.
    return dimensions[d]?.name === "outfit" ? 1 : 0;
  });
}

/** Cases that collapsed onto one descriptor, keyed by that descriptor. */
export interface CollisionGroup {
  readonly key: string;
  readonly cases: readonly SweepCase[];
}

/** The generated sweep: the deduplicated cases plus what was pruned. */
export interface SweepPlan {
  readonly dimensions: readonly SweepDimension<SweepValue>[];
  /** Cases with distinct composed descriptors, in generation order. */
  readonly cases: readonly SweepCase[];
  /**
   * The leading slice of `cases` that came from the per-option
   * baseline: every catalog entry, outfit, weapon, implant, and tin
   * shown once against the stock look. The tiers a full frame sweep
   * cannot afford over every case still run over these.
   */
  readonly perOption: readonly SweepCase[];
  /** Groups of generated cases that shared one descriptor. */
  readonly collisions: readonly CollisionGroup[];
  /** Raw index cases before the descriptor prune. */
  readonly generated: readonly IndexCase[];
  /** How many cases the full cross product would have been. */
  readonly exhaustive: number;
}

/**
 * Build the sweep: every option against the stock look, then all-pairs
 * coverage over all fourteen dimensions, composed and deduplicated by
 * descriptor. Pure and seeded — the same seed always yields the same
 * case list, so a failing combination reproduces exactly.
 */
export function sweepPlan(seed = 1): SweepPlan {
  const dimensions = sweepDimensions();
  const sizes = dimensions.map((dimension) => dimension.values.length);
  const defaults = defaultIndices(dimensions);
  const baseline = perOptionIndexCases(sizes, defaults);
  const generated = coverageIndexCases(sizes, defaults, seed);
  const byKey = new Map<string, SweepCase[]>();
  const cases: SweepCase[] = [];
  const perOption: SweepCase[] = [];
  generated.forEach((row, i) => {
    const built = buildCase(valuesOf(dimensions, row));
    const group = byKey.get(built.key);
    if (group) {
      group.push(built);
      return;
    }
    byKey.set(built.key, [built]);
    cases.push(built);
    // coverageIndexCases lists the per-option baseline first, in order.
    if (i < baseline.length) perOption.push(built);
  });
  const collisions = [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, cases: group }));
  return {
    dimensions,
    cases,
    perOption,
    collisions,
    generated,
    exhaustive: exhaustiveCaseCount(dimensions),
  };
}
