import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import {
  addItem,
  removeItem,
  type InventoryState,
  type ItemStack,
} from "./inventory";
import {
  InventoryError,
  type ItemResolver,
  type ModItem,
  type ModSocketKind,
  type WeaponItem,
} from "./items";
import {
  CRIT_SHARE_BASE,
  MOD_REMOVAL_FEE,
  installMod,
  normalizeMods,
  removeMod,
  storedMods,
  weaponProfile,
  type WeaponProfile,
} from "./mods";
import { equippedWeaponProfile } from "./selectors";

/**
 * The workbench: the only place a weapon's parts may be changed.
 *
 * The socket rules themselves live in ./mods.ts and know nothing about
 * benches. What this module adds is everything a bench *is* — which
 * weapons are on the rack (the one in hand plus every copy in the bag),
 * the fee for backing a part out, and the moves between the inventory,
 * the sockets and the purse that a fitting is.
 *
 * Pure over a `Workbench` triple. The UI holds a session and hands the
 * three pieces over; nothing here touches GameState, storage or the
 * DOM, and every operation returns a new triple.
 */

/** The slice of the run a bench may change. */
export interface Workbench {
  character: CharacterState;
  inventory: InventoryState;
  credits: number;
}

/**
 * Which weapon on the rack. The one in hand has no index; a carried
 * copy is addressed by its inventory stack index, because two copies of
 * the same weapon are two different objects the moment one is modded.
 */
export type WeaponRef =
  | { where: "equipped" }
  | { where: "carried"; stackIndex: number };

/** True when two references point at the same weapon on the rack. */
export function sameWeapon(a: WeaponRef, b: WeaponRef): boolean {
  return a.where === "equipped"
    ? b.where === "equipped"
    : b.where === "carried" && a.stackIndex === b.stackIndex;
}

/** One weapon on the rack, resolved. */
export interface BenchWeapon {
  ref: WeaponRef;
  item: WeaponItem;
  /** One entry per socket, in socket order; null is empty. */
  mods: (string | null)[];
  /** Its figures as they stand, with whatever is already fitted. */
  profile: WeaponProfile;
}

/**
 * Every weapon the bench can work on: the one in hand first, then each
 * carried copy in inventory order. Weapons with no sockets are still
 * listed — a bench that hides a weapon rather than saying "no sockets"
 * reads as a bug.
 */
export function benchWeapons(
  bench: Workbench,
  resolve: ItemResolver = requireItem,
): BenchWeapon[] {
  const weapons: BenchWeapon[] = [];
  const equippedId = bench.character.equipment.weapon;
  if (equippedId != null) {
    const item = resolve(equippedId);
    if (item.kind === "weapon") {
      const mods = normalizeMods(
        item,
        bench.character.equipment.weaponMods,
        resolve,
      );
      weapons.push({
        ref: { where: "equipped" },
        item,
        mods,
        profile: equippedWeaponProfile(bench.character, resolve) ?? {
          name: item.name,
          damage: item.damage,
          rangeType: item.rangeType,
        },
      });
    }
  }
  bench.inventory.stacks.forEach((stack, stackIndex) => {
    const item = resolve(stack.itemId);
    if (item.kind !== "weapon") return;
    const mods = normalizeMods(item, stack.mods, resolve);
    weapons.push({
      ref: { where: "carried", stackIndex },
      item,
      mods,
      profile: weaponProfile(item, fittedItems(mods, resolve)),
    });
  });
  return weapons;
}

/** The mod items behind a normalized slot list. */
function fittedItems(
  mods: readonly (string | null)[],
  resolve: ItemResolver,
): ModItem[] {
  const items: ModItem[] = [];
  for (const id of mods) {
    if (id == null) continue;
    const item = resolve(id);
    if (item.kind === "mod") items.push(item);
  }
  return items;
}

/** The weapon a reference names, or an error naming what went wrong. */
export function requireBenchWeapon(
  bench: Workbench,
  ref: WeaponRef,
  resolve: ItemResolver = requireItem,
): BenchWeapon {
  const found = benchWeapons(bench, resolve).find((w) => sameWeapon(w.ref, ref));
  if (!found) {
    throw new InventoryError(
      "not-carried",
      ref.where === "equipped"
        ? "No weapon in hand to work on"
        : `No weapon in carried stack ${ref.stackIndex}`,
    );
  }
  return found;
}

/** Writes a weapon's new parts back wherever that weapon lives. */
function withMods(
  bench: Workbench,
  ref: WeaponRef,
  weapon: WeaponItem,
  mods: (string | null)[],
  resolve: ItemResolver,
): Pick<Workbench, "character" | "inventory"> {
  const stored = storedMods(normalizeMods(weapon, mods, resolve));
  if (ref.where === "equipped") {
    return {
      character: {
        ...bench.character,
        equipment: {
          ...bench.character.equipment,
          weaponMods: stored,
        },
      },
      inventory: bench.inventory,
    };
  }
  const stacks = bench.inventory.stacks.map((stack, index): ItemStack => {
    if (index !== ref.stackIndex) return stack;
    const next: ItemStack = { itemId: stack.itemId, quantity: stack.quantity };
    if (stored) next.mods = stored;
    return next;
  });
  return { character: bench.character, inventory: { stacks } };
}

/**
 * Fits a carried part into a socket. The part leaves the inventory —
 * it is on the weapon now — and fitting is free: the bench charges for
 * getting one back out, not for putting one in.
 */
export function fitMod(
  bench: Workbench,
  ref: WeaponRef,
  socketIndex: number,
  modId: string,
  resolve: ItemResolver = requireItem,
): Workbench {
  const target = requireBenchWeapon(bench, ref, resolve);
  // Carrying it is checked before the socket rules so "you don't have
  // one" never reads as "it doesn't fit".
  const withoutPart = removeItem(bench.inventory, modId, 1);
  const mods = installMod(
    target.item,
    target.mods,
    socketIndex,
    modId,
    resolve,
  );
  const moved = withMods(
    { ...bench, inventory: withoutPart },
    ref,
    target.item,
    mods,
    resolve,
  );
  return { ...bench, ...moved };
}

/**
 * Backs a part out of a socket, intact, for MOD_REMOVAL_FEE credits.
 * The part goes back in the bag — that is the whole difference between
 * a weapon mod and a cyber implant, which extraction destroys.
 */
export function pullMod(
  bench: Workbench,
  ref: WeaponRef,
  socketIndex: number,
  resolve: ItemResolver = requireItem,
  fee: number = MOD_REMOVAL_FEE,
): Workbench {
  const target = requireBenchWeapon(bench, ref, resolve);
  if (bench.credits < fee) {
    throw new InventoryError(
      "insufficient-credits",
      `The bench charges ${fee} cr to pull a part; you have ${bench.credits}`,
    );
  }
  const pulled = removeMod(target.item, target.mods, socketIndex, resolve);
  const moved = withMods(
    {
      ...bench,
      inventory: addItem(bench.inventory, pulled.modId, 1, resolve),
    },
    ref,
    target.item,
    pulled.mods,
    resolve,
  );
  return { ...bench, ...moved, credits: bench.credits - fee };
}

/* --- Previews -------------------------------------------------------- */

/** A weapon figure a fitting would move, before and after. */
export interface ProfileDelta {
  /** Which figure: "damage", "accuracy", … */
  field: keyof Omit<WeaponProfile, "name" | "rangeType">;
  before: number;
  after: number;
}

/** What a fitting would do to the weapon's numbers, and what it costs. */
export interface FitPreview {
  before: WeaponProfile;
  after: WeaponProfile;
  /** Only the figures that actually move, in profile order. */
  deltas: ProfileDelta[];
  /** The part the fitting moves — the one going in, or coming out. */
  modId: string;
}

const PROFILE_FIELDS = [
  "damage",
  "accuracy",
  "armorPierce",
  "rangeBonus",
  "critShare",
] as const;

/** The figures two profiles disagree on, in a fixed reading order. */
export function profileDeltas(
  before: WeaponProfile,
  after: WeaponProfile,
): ProfileDelta[] {
  const deltas: ProfileDelta[] = [];
  for (const field of PROFILE_FIELDS) {
    const from = before[field] ?? defaultFor(field, before);
    const to = after[field] ?? defaultFor(field, after);
    if (from !== to) deltas.push({ field, before: from, after: to });
  }
  return deltas;
}

/** What an absent figure means, so a delta reads against something. */
function defaultFor(
  field: (typeof PROFILE_FIELDS)[number],
  profile: WeaponProfile,
): number {
  if (field === "damage") return profile.damage;
  if (field === "critShare") return CRIT_SHARE_BASE;
  return 0;
}

/**
 * What fitting `modId` into `socketIndex` would do — the numbers the
 * bench shows before the player commits. Derived by running the same
 * `weaponProfile` the fight will read, so a previewed delta and the
 * damage the weapon then deals cannot disagree.
 *
 * Returns null when the fitting is not legal at all (wrong socket kind,
 * occupied, no such socket): the bench greys the choice rather than
 * previewing a change that would be refused.
 */
export function previewFit(
  bench: Workbench,
  ref: WeaponRef,
  socketIndex: number,
  modId: string,
  resolve: ItemResolver = requireItem,
): FitPreview | null {
  const target = requireBenchWeapon(bench, ref, resolve);
  let mods: (string | null)[];
  try {
    mods = installMod(target.item, target.mods, socketIndex, modId, resolve);
  } catch (error) {
    if (error instanceof InventoryError) return null;
    throw error;
  }
  const after = weaponProfile(target.item, fittedItems(mods, resolve));
  return {
    before: target.profile,
    after,
    deltas: profileDeltas(target.profile, after),
    modId,
  };
}

/** What pulling the part in `socketIndex` would do; null when empty. */
export function previewPull(
  bench: Workbench,
  ref: WeaponRef,
  socketIndex: number,
  resolve: ItemResolver = requireItem,
): FitPreview | null {
  const target = requireBenchWeapon(bench, ref, resolve);
  let pulled: { mods: (string | null)[]; modId: string };
  try {
    pulled = removeMod(target.item, target.mods, socketIndex, resolve);
  } catch (error) {
    if (error instanceof InventoryError) return null;
    throw error;
  }
  const after = weaponProfile(
    target.item,
    fittedItems(pulled.mods, resolve),
  );
  return {
    before: target.profile,
    after,
    deltas: profileDeltas(target.profile, after),
    modId: pulled.modId,
  };
}

/** Loose parts in the bag that fit a socket of this kind, in bag order. */
export function fittableMods(
  bench: Workbench,
  socket: ModSocketKind,
  resolve: ItemResolver = requireItem,
): { modId: string; quantity: number; item: ModItem }[] {
  const rows: { modId: string; quantity: number; item: ModItem }[] = [];
  for (const stack of bench.inventory.stacks) {
    const item = resolve(stack.itemId);
    if (item.kind !== "mod" || item.socket !== socket) continue;
    const existing = rows.find((row) => row.modId === item.id);
    if (existing) existing.quantity += stack.quantity;
    else rows.push({ modId: item.id, quantity: stack.quantity, item });
  }
  return rows;
}
