import { requireItem } from "../data/items";
import type { MaterialName } from "../iso/art/palette";
// Type-only: equipment.ts and inventory.ts both import this module at
// runtime, so the edge back must never be a value import.
import type { EquipmentState } from "./equipment";
import type { InventoryState, ItemStack } from "./inventory";
import {
  InventoryError,
  bearsEffects,
  type Item,
  type ItemEffect,
  type ItemResolver,
  type ModEffect,
  type ModItem,
  type ModSocketKind,
  type RangeType,
  type WeaponItem,
} from "./items";

/**
 * Weapon modification: what sits in a weapon's sockets, what the rules
 * allow to go there, and the numbers that come out the other side.
 *
 * Two halves, both pure:
 *
 * - **Socket rules** (`installMod` / `removeMod`) operate on a plain
 *   `ModSlots` array — one entry per socket, in socket order, `null`
 *   for empty. They know nothing about who owns the weapon or where it
 *   is being worked on; the bench (see ./workbench.ts) is what adds the
 *   fee, the inventory moves, and the "only at a bench" rule.
 * - **Derivation** (`weaponProfile`) folds the fitted parts into the
 *   weapon's own figures. This is the single source those figures come
 *   from: combat setup snapshots it, so the engine, the legal-option
 *   queries, and every tooltip quote the same numbers without any of
 *   them knowing a mod exists.
 *
 * A mod's effect on the *character* (stats, granted abilities, dialogue
 * tags) is said in the ordinary ItemEffect vocabulary and folded in by
 * the equipment selectors (see ./selectors.ts), for the same reason.
 */

/** One entry per socket on the weapon, in socket order; null is empty. */
export type ModSlots = readonly (string | null)[];

/** Credits the bench charges to back a part out of a socket intact. */
export const MOD_REMOVAL_FEE = 40;

/** Item lookup that answers `undefined` instead of throwing. */
export type ItemLookup = (id: string) => Item | undefined;

/** Sockets a weapon offers, in bench order; empty when it takes none. */
export function weaponSockets(weapon: WeaponItem): readonly ModSocketKind[] {
  return weapon.sockets ?? [];
}

/** Looks an id up through a throwing resolver without letting it throw. */
function tryResolve(id: string, resolve: ItemResolver): Item | undefined {
  try {
    return resolve(id);
  } catch {
    return undefined;
  }
}

/**
 * The fitted parts as the rules see them: exactly one entry per socket,
 * in socket order, with anything that no longer belongs quietly dropped
 * — an id with no content, an item that is not a mod, a part in a
 * socket of the wrong kind, or an entry past the weapon's last socket.
 *
 * Dropping rather than throwing is deliberate: a save written against
 * older content must still load, and a part that no longer fits is a
 * part that was never fitted (see sanitizeMods).
 */
export function normalizeMods(
  weapon: WeaponItem,
  mods: ModSlots | undefined,
  resolve: ItemResolver = requireItem,
): (string | null)[] {
  return weaponSockets(weapon).map((socket, index) => {
    const id = mods?.[index] ?? null;
    if (id == null) return null;
    const item = tryResolve(id, resolve);
    return item?.kind === "mod" && item.socket === socket ? id : null;
  });
}

/** True when at least one socket is filled. */
export function hasMods(mods: ModSlots | undefined): boolean {
  return (mods ?? []).some((id) => id != null);
}

/**
 * The slots as they should be *stored*: an all-empty set is stored as
 * nothing at all, so an unmodded weapon serializes exactly as it did
 * before weapons had sockets.
 */
export function storedMods(mods: ModSlots): (string | null)[] | undefined {
  return hasMods(mods) ? [...mods] : undefined;
}

/** The mod items fitted to a weapon, in socket order; gaps are skipped. */
export function installedMods(
  weapon: WeaponItem,
  mods: ModSlots | undefined,
  resolve: ItemResolver = requireItem,
): ModItem[] {
  const fitted: ModItem[] = [];
  for (const id of normalizeMods(weapon, mods, resolve)) {
    if (id == null) continue;
    const item = tryResolve(id, resolve);
    if (item?.kind === "mod") fitted.push(item);
  }
  return fitted;
}

/** The socket at `index`, or undefined when the weapon has none there. */
export function socketAt(
  weapon: WeaponItem,
  index: number,
): ModSocketKind | undefined {
  return weaponSockets(weapon)[index];
}

/**
 * Fits a part into a socket. One part per socket — swapping means
 * taking the old one out first, which is what the removal fee is for.
 * Returns the new slots; the caller moves the item.
 */
export function installMod(
  weapon: WeaponItem,
  mods: ModSlots | undefined,
  socketIndex: number,
  modId: string,
  resolve: ItemResolver = requireItem,
): (string | null)[] {
  const sockets = weaponSockets(weapon);
  if (sockets.length === 0) {
    throw new InventoryError(
      "no-sockets",
      `"${weapon.id}" has no mod sockets`,
    );
  }
  const socket = sockets[socketIndex];
  if (socket === undefined) {
    throw new InventoryError(
      "unknown-socket",
      `"${weapon.id}" has no socket ${socketIndex}`,
    );
  }
  const item = resolve(modId);
  if (item.kind !== "mod") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot fit "${modId}": not a weapon mod`,
    );
  }
  if (item.socket !== socket) {
    throw new InventoryError(
      "wrong-socket",
      `Cannot fit "${modId}": it is a ${item.socket} part and that is a ${socket} socket`,
    );
  }
  const current = normalizeMods(weapon, mods, resolve);
  const occupant = current[socketIndex];
  if (occupant != null) {
    throw new InventoryError(
      "socket-occupied",
      `Cannot fit "${modId}": the ${socket} socket already holds "${occupant}"`,
    );
  }
  const next = [...current];
  next[socketIndex] = modId;
  return next;
}

/**
 * Backs a part out of a socket. The part survives — it comes back as an
 * id the caller returns to the inventory — which is the whole
 * difference between a mod and a cyber implant.
 */
export function removeMod(
  weapon: WeaponItem,
  mods: ModSlots | undefined,
  socketIndex: number,
  resolve: ItemResolver = requireItem,
): { mods: (string | null)[]; modId: string } {
  if (socketAt(weapon, socketIndex) === undefined) {
    throw new InventoryError(
      "unknown-socket",
      `"${weapon.id}" has no socket ${socketIndex}`,
    );
  }
  const current = normalizeMods(weapon, mods, resolve);
  const modId = current[socketIndex];
  if (modId == null) {
    throw new InventoryError(
      "socket-empty",
      `Nothing is fitted in socket ${socketIndex} of "${weapon.id}"`,
    );
  }
  const next = [...current];
  next[socketIndex] = null;
  return { mods: next, modId };
}

/**
 * Brings a whole loadout's fitted parts back inside the rules: every
 * weapon in hand or in the bag keeps only what still fits its sockets.
 *
 * Run on load (see migrateGameState), for the same reason the lore
 * collection is clamped there — a save can outlive the content it was
 * written against. A weapon that has never been to a bench comes back
 * byte-identical, which is what makes every pre-mod save a no-op.
 */
export function sanitizeMods<T extends { equipment: EquipmentState }>(
  player: T,
  inventory: InventoryState,
  resolve: ItemResolver = requireItem,
): { player: T; inventory: InventoryState } {
  const weaponId = player.equipment.weapon;
  const held = weaponId == null ? undefined : tryResolve(weaponId, resolve);
  const heldMods =
    held?.kind === "weapon"
      ? storedMods(normalizeMods(held, player.equipment.weaponMods, resolve))
      : undefined;

  const stacks = inventory.stacks.map((stack) => {
    if (stack.mods === undefined) return stack;
    const item = tryResolve(stack.itemId, resolve);
    const kept =
      item?.kind === "weapon"
        ? storedMods(normalizeMods(item, stack.mods, resolve))
        : undefined;
    // Everything else the copy carries (its color) is left alone — this
    // pass answers for fitted parts only.
    const next: ItemStack = { ...stack };
    delete next.mods;
    if (kept) next.mods = kept;
    return next;
  });

  return {
    player: {
      ...player,
      equipment: { ...player.equipment, weaponMods: heldMods },
    },
    inventory: { stacks },
  };
}

/* --- Derivation ------------------------------------------------------ */

/**
 * A weapon's combat figures with its parts folded in. This is the shape
 * combat snapshots as `CombatWeapon` — the fields past `rangeType` are
 * absent on anything unmodded, so an enemy's plain weapon literal is
 * still a whole profile and the numbers it produces are unchanged.
 */
export interface WeaponProfile {
  name: string;
  damage: number;
  rangeType: RangeType;
  /** Armor points a landed blow ignores. Absent is none. */
  armorPierce?: number;
  /** Hit-roll shift in points of the attack stat. Absent is none. */
  accuracy?: number;
  /** Extra tiles of reach; may be negative. Absent is none. */
  rangeBonus?: number;
  /**
   * Share of a target's frame a blow must take to read as critical.
   * Absent leaves the reading at CRITICAL_DAMAGE_SHARE.
   */
  critShare?: number;
}

/** Least damage a weapon can be modded down to. */
export const MIN_WEAPON_DAMAGE = 1;

/**
 * The unmodded reading a crit-share mod shifts from. Kept here rather
 * than imported from combat so the inventory layer stays a leaf; the
 * combat module pins the two against each other in a test.
 */
export const CRIT_SHARE_BASE = 1 / 3;

/** Bounds a mod may push the critical reading between. */
export const MIN_CRIT_SHARE = 0.05;
export const MAX_CRIT_SHARE = 1;

/**
 * The weapon's numbers with every fitted part folded in — the one place
 * a modded weapon's figures are worked out. Combat setup snapshots this
 * into the fight, so the engine, the legal-option queries, and the
 * preview layer all read one derivation.
 */
export function weaponProfile(
  weapon: WeaponItem,
  mods: readonly ModItem[] = [],
): WeaponProfile {
  let damage = weapon.damage;
  let armorPierce = 0;
  let accuracy = 0;
  let rangeBonus = 0;
  let critShare: number | null = null;

  for (const mod of mods) {
    for (const effect of mod.effects) {
      switch (effect.type) {
        case "weapon-damage":
          damage += effect.amount;
          break;
        case "armor-pierce":
          armorPierce += effect.amount;
          break;
        case "accuracy":
          accuracy += effect.amount;
          break;
        case "weapon-range":
          rangeBonus += effect.amount;
          break;
        case "crit-share":
          critShare = (critShare ?? CRIT_SHARE_BASE) + effect.amount;
          break;
        default:
          // Character-facing effects are the selectors' business.
          break;
      }
    }
  }

  return {
    name: weapon.name,
    damage: Math.max(MIN_WEAPON_DAMAGE, damage),
    rangeType: weapon.rangeType,
    ...(armorPierce !== 0 ? { armorPierce } : {}),
    ...(accuracy !== 0 ? { accuracy } : {}),
    ...(rangeBonus !== 0 ? { rangeBonus } : {}),
    ...(critShare !== null
      ? {
          critShare: Math.min(
            MAX_CRIT_SHARE,
            Math.max(MIN_CRIT_SHARE, critShare),
          ),
        }
      : {}),
  };
}

/**
 * The accent a modded weapon wears: the first fitted part that names
 * one, in socket order. Absent leaves the weapon's own authored accent
 * alone, which is what an unmodded weapon has always drawn.
 */
export function modAccent(
  weapon: WeaponItem,
  mods: ModSlots | undefined,
  lookup: ItemLookup,
): MaterialName | undefined {
  for (const [index, socket] of weaponSockets(weapon).entries()) {
    const id = mods?.[index];
    if (id == null) continue;
    const item = lookup(id);
    if (item?.kind !== "mod" || item.socket !== socket) continue;
    if (item.accent !== undefined) return item.accent;
  }
  return undefined;
}

/** True for the effects an ordinary piece of gear could also carry. */
export function isItemEffect(effect: ModEffect): effect is ItemEffect {
  return (
    effect.type === "stat-mod" ||
    effect.type === "grant-ability" ||
    effect.type === "unlock-dialogue"
  );
}

/**
 * Every effect a piece of gear contributes to the character. Weapons,
 * outfits and implants carry ItemEffects only; a mod's list is wider,
 * and the weapon-shaping half of it belongs to `weaponProfile` rather
 * than here.
 */
export function characterEffects(item: Item): ItemEffect[] {
  if (!bearsEffects(item)) return [];
  return item.kind === "mod"
    ? item.effects.filter(isItemEffect)
    : item.effects;
}
