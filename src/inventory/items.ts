import type { StatKey } from "../character/stats";

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

export interface WeaponItem extends ItemBase {
  kind: "weapon";
  damage: number;
  rangeType: RangeType;
  /** Minimum effective stat needed to equip this weapon. */
  requirement?: { stat: StatKey; value: number };
  effects: ItemEffect[];
}

export interface OutfitItem extends ItemBase {
  kind: "outfit";
  /** Flat damage reduction while worn. */
  armor: number;
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
  | "not-installed";

export class InventoryError extends Error {
  constructor(
    readonly code: InventoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}
