import type { StatKey } from "../character/stats";
import type { OutfitLayerId } from "../iso/art/layers/outfits";
import type { WeaponClassId } from "../iso/art/layers/weapons";
import type { MaterialName } from "../iso/art/palette";

/**
 * Item model: a discriminated union of item kinds. Items are pure typed
 * data — effects are declarative (stat mods, ability grants by id,
 * dialogue unlock tags) and are interpreted by the systems that consume
 * them. An item never carries functions. Content lives in src/data/items.ts.
 */

export type ItemEffect =
  | { type: "stat-mod"; stat: StatKey; amount: number }
  | { type: "grant-ability"; abilityId: string }
  | { type: "unlock-dialogue"; tag: string };

export type RangeType = "melee" | "ranged";

export const ENHANCEMENT_SLOTS = ["eyes", "arms", "neural", "dermal"] as const;
export type EnhancementSlot = (typeof ENHANCEMENT_SLOTS)[number];

interface ItemBase {
  id: string;
  name: string;
  description: string;
}

/**
 * How a weapon renders in the character's hands: which authored class
 * silhouette it draws, and an optional material-ramp recolor for the
 * energy-glow accent channel. Pure typed data — resolveLayers turns it
 * into a layer-engine reference, so art code never switches on item
 * ids. Weapons without one (and bare hands) draw nothing.
 */
export interface WeaponLayerRef {
  /** Weapon class silhouette in the weapon art registry. */
  id: WeaponClassId;
  /** Recolor the energy-glow accent channel onto this material ramp. */
  accent?: MaterialName;
}

export interface WeaponItem extends ItemBase {
  kind: "weapon";
  damage: number;
  rangeType: RangeType;
  /** Minimum effective stat needed to equip this weapon. */
  requirement?: { stat: StatKey; value: number };
  /** Sprite layer held while equipped; absent means empty hands. */
  weaponLayer?: WeaponLayerRef;
  effects: ItemEffect[];
}

/**
 * How an outfit renders on the character sprite: which authored layer
 * family it wears, and optional material-ramp recolors for the outfit
 * primary (main cloth) and accent (trim) remap channels. Pure typed
 * data — resolveLayers turns it into a layer-engine reference, so art
 * code never switches on item ids.
 */
export interface OutfitLayerRef {
  /** Outfit layer family in the outfit art registry. */
  id: OutfitLayerId;
  /** Recolor the main cloth channel onto this material ramp. */
  primary?: MaterialName;
  /** Recolor the trim channel onto this material ramp. */
  accent?: MaterialName;
}

export interface OutfitItem extends ItemBase {
  kind: "outfit";
  /** Flat damage reduction while worn. */
  armor: number;
  /**
   * Sprite layer worn while equipped; items without one keep the
   * body's base garb underlayer visible instead.
   */
  outfitLayer?: OutfitLayerRef;
  effects: ItemEffect[];
}

export type ConsumableEffect =
  | { type: "heal"; amount: number }
  | { type: "combat-boost"; stat: StatKey; amount: number; turns: number };

export interface ConsumableItem extends ItemBase {
  kind: "consumable";
  effect: ConsumableEffect;
}

export interface EnhancementItem extends ItemBase {
  kind: "enhancement";
  slot: EnhancementSlot;
  /** Neural load consumed while installed; total is capped by derived.neuralCapacity. */
  neuralCost: number;
  effects: ItemEffect[];
}

export interface MiscItem extends ItemBase {
  kind: "misc";
  /** Tags narrative gates match on (e.g. keycards, evidence). */
  tags: string[];
}

export type Item =
  | WeaponItem
  | OutfitItem
  | ConsumableItem
  | EnhancementItem
  | MiscItem;

/**
 * Looks an item up by id, throwing InventoryError("unknown-item") for ids
 * with no content. Inventory functions take one so tests can inject
 * fixture items; the default is requireItem from src/data/items.ts.
 */
export type ItemResolver = (id: string) => Item;

/** Consumables and misc items stack; gear is tracked one copy per stack. */
export function isStackable(item: Item): boolean {
  return item.kind === "consumable" || item.kind === "misc";
}

export type InventoryErrorCode =
  | "unknown-item"
  | "not-carried"
  | "wrong-kind"
  | "stat-requirement"
  | "slot-occupied"
  | "neural-capacity"
  | "not-equipped"
  | "not-installed"
  | "not-usable";

export class InventoryError extends Error {
  constructor(
    readonly code: InventoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}
