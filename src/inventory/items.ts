import type { StatKey } from "../character/stats";
import type { CyberLayerId } from "../iso/art/layers/cyberware";
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

/**
 * Where a part bolts onto a weapon. The kind is the whole compatibility
 * rule: a barrel socket takes what shapes the shot, a core socket what
 * drives it, a grip socket what steadies it — so a scope can never be
 * screwed into a knife's handle mount, and a weapon offers only the
 * sockets its silhouette could plausibly carry.
 */
export const MOD_SOCKET_KINDS = ["barrel", "core", "grip"] as const;
export type ModSocketKind = (typeof MOD_SOCKET_KINDS)[number];

/**
 * How a part reshapes the weapon's own numbers. These are the figures
 * the attack math reads (see src/combat/damage.ts); everything a mod
 * does to the *character* — stats, granted abilities, dialogue tags —
 * is said in the ordinary ItemEffect vocabulary instead, so a mod's
 * +1 Reflexes and an outfit's are folded in by the same selector.
 */
export type WeaponModEffect =
  /** Shifts the weapon's base damage. */
  | { type: "weapon-damage"; amount: number }
  /** Armor points a landed blow ignores. */
  | { type: "armor-pierce"; amount: number }
  /** Shifts the hit roll, in points of the attack stat. */
  | { type: "accuracy"; amount: number }
  /** Shifts the weapon's reach, in tiles. */
  | { type: "weapon-range"; amount: number }
  /**
   * Shifts the share of a target's frame a blow must take to read as a
   * critical one (negative makes criticals easier). Like the reading it
   * moves, this changes what a blow *looks* like, never what it deals.
   */
  | { type: "crit-share"; amount: number };

export type ModEffect = ItemEffect | WeaponModEffect;

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
  /**
   * Mod sockets this weapon carries, in bench order. Absent (and empty)
   * means the weapon takes no parts at all. Tier decides the count —
   * one on a starter, two on tier-2 hardware — and the kinds decide
   * what fits (see ModSocketKind and src/inventory/mods.ts).
   */
  sockets?: readonly ModSocketKind[];
  effects: ItemEffect[];
}

/**
 * A part that bolts into a weapon socket. Mods are carried like any
 * other item and do nothing until fitted; while fitted they are not in
 * the inventory at all — they live on the weapon copy they were fitted
 * to (see ItemStack.mods), which is what makes a modded weapon a
 * distinct object rather than an id.
 */
export interface ModItem extends ItemBase {
  kind: "mod";
  /** Socket kind this fits; a weapon must offer one to take it. */
  socket: ModSocketKind;
  effects: ModEffect[];
  /**
   * Repaints the weapon layer's energy-glow accent channel while
   * fitted — the same channel an item's own `weaponLayer.accent` uses,
   * so a modded weapon reads as modded on the street. The first fitted
   * part with an accent wins (see modAccent).
   */
  accent?: MaterialName;
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

/**
 * A recolor of the outfit layer's two material channels, overriding the
 * ones the worn item declares. This is how one issued coat serves a
 * whole look family: a crew's colors are the accent channel, a
 * different cloth is the primary. Absent channels keep the item's own
 * materials, so a dye that names only an accent leaves the cloth alone.
 *
 * Two things wear one: an authored look (see CharacterVisual.outfitDye
 * — a crew's colors, fixed by the content that declares them) and a
 * single copy of a player's outfit (see ItemStack.dye — a tin bought at
 * the chapel and rubbed into that coat). The second never reaches the
 * first: an override lives on an item instance, and no NPC has one.
 */
export interface OutfitDye {
  readonly primary?: MaterialName;
  readonly accent?: MaterialName;
}

/** True when a dye names at least one channel to repaint. */
export function dyesAnything(dye: OutfitDye | undefined): dye is OutfitDye {
  return !!dye && (dye.primary !== undefined || dye.accent !== undefined);
}

/**
 * The color as it should be *stored*: a dye naming no channel is stored
 * as nothing at all, so an undyed outfit serializes exactly as it did
 * before the chapel sold color. Named channels are copied out, so a
 * stored value never aliases an item's authored data.
 */
export function storedDye(dye: OutfitDye | undefined): OutfitDye | undefined {
  if (!dyesAnything(dye)) return undefined;
  return {
    ...(dye.primary !== undefined ? { primary: dye.primary } : {}),
    ...(dye.accent !== undefined ? { accent: dye.accent } : {}),
  };
}

/**
 * A tin of outfit color. Applying one is cosmetic and nothing else: it
 * writes an OutfitDye onto the copy of the outfit it is rubbed into
 * (see src/inventory/dye.ts), changing no figure the fight or any gate
 * ever reads. Tins are consumed by the application, so a look that
 * keeps changing keeps costing.
 */
export interface DyeItem extends ItemBase {
  kind: "dye";
  /** The channels this tin repaints; at least one, or it dyes nothing. */
  colors: OutfitDye;
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

/**
 * Where a consumable may be opened. A dose is a decision about *when*
 * as much as about what: a stim is a combat action spent instead of a
 * swing, and a field kit is twenty minutes sitting on a crate, which is
 * not a thing anybody does with a chassis walking at them.
 *
 * Both contexts is the ordinary reading for a battlefield dressing —
 * the one thing you use either side of a fight.
 */
export const CONSUMABLE_CONTEXTS = ["combat", "exploration"] as const;

export type ConsumableContext = (typeof CONSUMABLE_CONTEXTS)[number];

/**
 * What kind of thing a consumable is, for the shelf, the label, and
 * nothing else. The *rules* are all in the effects below — this is the
 * word a player would use for it.
 */
export const CONSUMABLE_KINDS = ["stim", "food", "kit", "oddity"] as const;

export type ConsumableKind = (typeof CONSUMABLE_KINDS)[number];

/**
 * The slot a timed effect occupies on a body. Two effects of one family
 * never run at once: a second dose *replaces* the first rather than
 * adding to it, which is the whole of the stacking rule (see
 * refreshFamily in ./consumables.ts).
 *
 * Families are named for what they occupy rather than for the item that
 * grants them, so a cheap stim and an expensive one compete for the
 * same nerve — and a crash occupies the family it came out of, which is
 * what makes re-dosing push the crash back instead of doubling it.
 */
export const EFFECT_FAMILIES = [
  /** Wired reflexes: the accelerant lines. */
  "reflex-stim",
  /** Braced frame: the ones that make a body hit harder. */
  "bone-stim",
  /** Having eaten: the small, long, cheap one. */
  "well-fed",
] as const;

export type EffectFamily = (typeof EFFECT_FAMILIES)[number];

/**
 * A stat shift with a clock on it, and what the body owes when the
 * clock runs out.
 *
 * `turns` is counted in the owner's own turns, exactly like every other
 * duration in a fight (see ActiveBoost). `after` is the crash: it lands
 * the moment the lift expires, in the same family, so a fresh dose
 * replaces the crash as well as the lift — re-dosing postpones the bill
 * rather than cancelling it.
 */
export interface TimedEffect {
  family: EffectFamily;
  stat: StatKey;
  amount: number;
  /** Owner's turns the shift lasts. */
  turns: number;
  /** What lands when it wears off; absent for a clean effect. */
  after?: { stat: StatKey; amount: number; turns: number };
}

export type ConsumableEffect =
  /** Hit points back, now. */
  | { type: "heal"; amount: number }
  /** A timed shift, starting in this fight. */
  | { type: "boost"; boost: TimedEffect }
  /** A timed shift held over for the *next* fight — what a meal is. */
  | { type: "ready-boost"; boost: TimedEffect }
  /** Closes the injury the user is carrying, with no clinic involved. */
  | { type: "treat-injury" }
  /**
   * Settles a body: the cyberware noise banked this fight goes back to
   * nothing (the surge clock restarts rather than being spent), and
   * every after-cost still being carried is bled off with it.
   */
  | { type: "settle" };

export interface ConsumableItem extends ItemBase {
  kind: "consumable";
  /** The word for it on a shelf; no rule reads this. */
  consumableKind: ConsumableKind;
  /** Where it may be opened; at least one, or nobody can use it. */
  contexts: readonly ConsumableContext[];
  /** Everything one dose does, applied in order. */
  effects: readonly ConsumableEffect[];
}

/**
 * How an installed enhancement renders on the character sprite: which
 * authored cyberware overlay family it shows, and an optional
 * material-ramp recolor for the neon-glow accent channel. Pure typed
 * data — resolveLayers turns it into a layer-engine reference, so art
 * code never switches on item ids. Enhancements without one (and empty
 * install slots) draw nothing.
 */
export interface CyberLayerRef {
  /** Cyberware overlay family in the cyberware art registry. */
  id: CyberLayerId;
  /** Recolor the neon-glow accent channel onto this material ramp. */
  accent?: MaterialName;
}

export interface EnhancementItem extends ItemBase {
  kind: "enhancement";
  slot: EnhancementSlot;
  /** Neural load consumed while installed; total is capped by derived.neuralCapacity. */
  neuralCost: number;
  /**
   * Static this implant adds to the character's neural noise while
   * installed — the second cost of chrome, and the one capacity does
   * not cap (see src/data/static.ts). Negative on a dampener, which is
   * how an implant that quiets the others still pays for a slot and a
   * share of neural load like everything else.
   */
  staticLoad: number;
  /** Sprite overlay shown while installed; absent means no visible mark. */
  cyberLayer?: CyberLayerRef;
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
  | ModItem
  | DyeItem
  | MiscItem;

/**
 * Item kinds whose effects the equipment selectors fold over the
 * character. Mods qualify — a fitted part's +1 Reflexes counts exactly
 * like an outfit's — but only through the weapon it is fitted to, so
 * `equippedItems` (which reports slots) never returns one.
 */
export type EffectBearingItem =
  | WeaponItem
  | OutfitItem
  | EnhancementItem
  | ModItem;

/** True for the kinds that carry an `effects` list. */
export function bearsEffects(item: Item): item is EffectBearingItem {
  return (
    item.kind === "weapon" ||
    item.kind === "outfit" ||
    item.kind === "enhancement" ||
    item.kind === "mod"
  );
}

/**
 * Looks an item up by id, throwing InventoryError("unknown-item") for ids
 * with no content. Inventory functions take one so tests can inject
 * fixture items; the default is requireItem from src/data/items.ts.
 */
export type ItemResolver = (id: string) => Item;

/**
 * Consumables, misc items, loose mods and unopened dye tins stack; worn
 * gear is tracked one copy per stack, because a copy can differ from
 * its fellows (a weapon carries the parts fitted to it, an outfit the
 * color rubbed into it). A loose mod or a sealed tin carries nothing,
 * so two of them are genuinely the same thing.
 */
export function isStackable(item: Item): boolean {
  return (
    item.kind === "consumable" ||
    item.kind === "misc" ||
    item.kind === "mod" ||
    item.kind === "dye"
  );
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
  | "not-usable"
  /** The weapon carries no sockets at all. */
  | "no-sockets"
  /** No socket at that index on this weapon. */
  | "unknown-socket"
  /** The part does not fit that socket's kind. */
  | "wrong-socket"
  /** Something is already fitted there. */
  | "socket-occupied"
  /** Nothing is fitted there to take out. */
  | "socket-empty"
  /** That outfit has no cloth to dye (no sprite layer of its own). */
  | "not-dyeable"
  /** Asked to strip factory colors back onto an outfit wearing none. */
  | "not-dyed"
  /** The bench's fee is more than the player is carrying. */
  | "insufficient-credits";

export class InventoryError extends Error {
  constructor(
    readonly code: InventoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InventoryError";
  }
}
