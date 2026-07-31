import type { CharacterState } from "../character/create";
import { requireItem } from "../data/items";
import { MATERIAL_RAMPS } from "../iso/art/palette";
import {
  addItem,
  removeItem,
  type InventoryState,
  type ItemStack,
} from "./inventory";
import {
  InventoryError,
  dyesAnything,
  storedDye,
  type DyeItem,
  type Item,
  type ItemResolver,
  type OutfitDye,
  type OutfitItem,
} from "./items";

/**
 * Outfit dyes: the cosmetic color a player rubs into one copy of one
 * coat, and the rules for putting it on, replacing it, and taking it
 * back off.
 *
 * Everything here is pure and instance-scoped. A dye is stored on the
 * item copy (ItemStack.dye, EquipmentState.outfitDye), exactly where a
 * weapon's fitted parts are stored, and for the same reason: two of the
 * same coat stop being the same object the moment one of them is green.
 * Nothing a dye touches is a figure — no armor, no stat, no gate — so a
 * dyed coat and a factory one are the same coat in every fight.
 *
 * NPCs are not affected by any of this. An authored look wears its crew
 * colors through CharacterVisual.outfitDye (see src/character/
 * appearance.ts), which no player action can reach; the two paths meet
 * only in outfitChannelRemap, where they are both just colors.
 */

/**
 * The slice of a run a dye counter may change: the same triple the
 * bench works over (see ./workbench.ts), because dyeing is the same
 * kind of transaction — inventory moves, a slot rewritten, credits.
 */
export interface DyeCounter {
  character: CharacterState;
  inventory: InventoryState;
  credits: number;
}

/**
 * Which coat. The one worn has no index; a carried copy is addressed by
 * its inventory stack index, because two copies of the same outfit are
 * two different objects the moment one is dyed.
 */
export type OutfitRef =
  | { where: "equipped" }
  | { where: "carried"; stackIndex: number };

/** True when two references point at the same coat. */
export function sameOutfit(a: OutfitRef, b: OutfitRef): boolean {
  return a.where === "equipped"
    ? b.where === "equipped"
    : b.where === "carried" && a.stackIndex === b.stackIndex;
}

/** One coat on the counter, resolved. */
export interface DyeableOutfit {
  ref: OutfitRef;
  item: OutfitItem;
  /** Its color as it stands, or undefined for factory colors. */
  dye: OutfitDye | undefined;
  /** False for outfits with no sprite layer — there is no cloth. */
  dyeable: boolean;
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
 * True for the outfits that can hold a color: one carrying its own
 * sprite layer. An item without one keeps the body's base garb
 * underlayer, and there is nothing on the sprite a dye would repaint.
 */
export function isDyeable(item: Item | undefined): item is OutfitItem {
  return item?.kind === "outfit" && item.outfitLayer !== undefined;
}

/** The channels a tin repaints. */
export function dyeColors(item: DyeItem): OutfitDye {
  return item.colors;
}

/** True when a material name still exists in the palette. */
function knownMaterial(name: string | undefined): boolean {
  return name === undefined || name in MATERIAL_RAMPS;
}

/**
 * A stored color brought back inside the rules: dropped entirely when
 * the item cannot hold one, or when a channel names a material this
 * build no longer has. Dropping rather than throwing is deliberate — a
 * save written against older content must still load, and a color that
 * cannot be painted was never painted (see sanitizeDyes).
 */
export function normalizeDye(
  item: Item | undefined,
  dye: OutfitDye | undefined,
): OutfitDye | undefined {
  if (!isDyeable(item) || !dyesAnything(dye)) return undefined;
  if (!knownMaterial(dye.primary) || !knownMaterial(dye.accent)) {
    return undefined;
  }
  return storedDye(dye);
}

/** True when two colors would paint the same coat the same way. */
export function sameDye(
  a: OutfitDye | undefined,
  b: OutfitDye | undefined,
): boolean {
  const left = storedDye(a);
  const right = storedDye(b);
  return left?.primary === right?.primary && left?.accent === right?.accent;
}

/**
 * Every outfit the counter can work on: the one worn first, then each
 * carried copy in inventory order. Outfits with no layer are still
 * listed — a counter that hides a coat rather than saying "nothing to
 * dye here" reads as a bug.
 */
export function dyeableOutfits(
  counter: DyeCounter,
  resolve: ItemResolver = requireItem,
): DyeableOutfit[] {
  const coats: DyeableOutfit[] = [];
  const wornId = counter.character.equipment.outfit;
  if (wornId != null) {
    const item = tryResolve(wornId, resolve);
    if (item?.kind === "outfit") {
      coats.push({
        ref: { where: "equipped" },
        item,
        dye: normalizeDye(item, counter.character.equipment.outfitDye),
        dyeable: isDyeable(item),
      });
    }
  }
  counter.inventory.stacks.forEach((stack, stackIndex) => {
    const item = tryResolve(stack.itemId, resolve);
    if (item?.kind !== "outfit") return;
    coats.push({
      ref: { where: "carried", stackIndex },
      item,
      dye: normalizeDye(item, stack.dye),
      dyeable: isDyeable(item),
    });
  });
  return coats;
}

/** The coat a reference names, or an error naming what went wrong. */
export function requireDyeTarget(
  counter: DyeCounter,
  ref: OutfitRef,
  resolve: ItemResolver = requireItem,
): DyeableOutfit {
  const found = dyeableOutfits(counter, resolve).find((coat) =>
    sameOutfit(coat.ref, ref),
  );
  if (!found) {
    throw new InventoryError(
      "not-carried",
      ref.where === "equipped"
        ? "No outfit worn to dye"
        : `No outfit in carried stack ${ref.stackIndex}`,
    );
  }
  return found;
}

/** Writes a coat's new color back wherever that coat lives. */
function withDye(
  counter: DyeCounter,
  ref: OutfitRef,
  item: OutfitItem,
  dye: OutfitDye | undefined,
): Pick<DyeCounter, "character" | "inventory"> {
  const stored = normalizeDye(item, dye);
  if (ref.where === "equipped") {
    return {
      character: {
        ...counter.character,
        equipment: { ...counter.character.equipment, outfitDye: stored },
      },
      inventory: counter.inventory,
    };
  }
  const stacks = counter.inventory.stacks.map((stack, index): ItemStack => {
    if (index !== ref.stackIndex) return stack;
    const next: ItemStack = { ...stack };
    delete next.dye;
    if (stored) next.dye = stored;
    return next;
  });
  return { character: counter.character, inventory: { stacks } };
}

/**
 * Rubs a carried tin into a coat. The tin is used up — that is what
 * makes color an economy rather than a menu — and a coat already
 * wearing a color simply takes the new one: re-dyeing replaces, it
 * never layers.
 */
export function applyDye(
  counter: DyeCounter,
  ref: OutfitRef,
  dyeId: string,
  resolve: ItemResolver = requireItem,
): DyeCounter {
  const target = requireDyeTarget(counter, ref, resolve);
  const tin = resolve(dyeId);
  if (tin.kind !== "dye") {
    throw new InventoryError(
      "wrong-kind",
      `Cannot dye with "${dyeId}": not a dye`,
    );
  }
  if (!target.dyeable) {
    throw new InventoryError(
      "not-dyeable",
      `"${target.item.id}" has no cloth of its own to dye`,
    );
  }
  // Carrying it is checked before anything is written, so a refusal
  // leaves the coat exactly as it was.
  const spent = removeItem(counter.inventory, dyeId, 1);
  const moved = withDye(
    { ...counter, inventory: spent },
    ref,
    target.item,
    dyeColors(tin),
  );
  return { ...counter, ...moved };
}

/**
 * Strips a coat back to factory colors. Free, and the tin does not come
 * back — the color went into the cloth, and the solvent is Vesper's.
 */
export function stripDye(
  counter: DyeCounter,
  ref: OutfitRef,
  resolve: ItemResolver = requireItem,
): DyeCounter {
  const target = requireDyeTarget(counter, ref, resolve);
  if (!target.dye) {
    throw new InventoryError(
      "not-dyed",
      `"${target.item.id}" is already wearing its factory colors`,
    );
  }
  return { ...counter, ...withDye(counter, ref, target.item, undefined) };
}

/** Buys a tin off the shelf: credits out, tin in the bag. */
export function buyDye(
  counter: DyeCounter,
  dyeId: string,
  price: number,
  resolve: ItemResolver = requireItem,
): DyeCounter {
  const item = resolve(dyeId);
  if (item.kind !== "dye") {
    throw new InventoryError("wrong-kind", `"${dyeId}" is not a dye`);
  }
  if (counter.credits < price) {
    throw new InventoryError(
      "insufficient-credits",
      `That tin is ${price} cr; you have ${counter.credits}`,
    );
  }
  return {
    ...counter,
    credits: counter.credits - price,
    inventory: addItem(counter.inventory, dyeId, 1, resolve),
  };
}

/**
 * The chapel's whole transaction: buy the tin and have it rubbed in on
 * the spot. Application is free with the purchase — Vesper charges for
 * color, not for the ten seconds it takes her to apply it — so this is
 * exactly buyDye followed by applyDye, and either half's refusal leaves
 * the counter untouched.
 */
export function buyAndApplyDye(
  counter: DyeCounter,
  ref: OutfitRef,
  dyeId: string,
  price: number,
  resolve: ItemResolver = requireItem,
): DyeCounter {
  // The coat is checked first so an unaffordable-looking refusal is
  // never really "you have nothing to wear".
  requireDyeTarget(counter, ref, resolve);
  return applyDye(buyDye(counter, dyeId, price, resolve), ref, dyeId, resolve);
}

/**
 * Brings a whole loadout's colors back inside the rules: the worn coat
 * and every copy in the bag keep only a color they can actually wear.
 *
 * Run on load (see migrateGameState), for the same reason fitted parts
 * are sanitized there — a save can outlive the content it was written
 * against. A wardrobe that has never seen a tin comes back
 * byte-identical, which is what makes every pre-dye save a no-op.
 */
export function sanitizeDyes<
  T extends { equipment: { outfit: string | null; outfitDye?: OutfitDye } },
>(
  player: T,
  inventory: InventoryState,
  resolve: ItemResolver = requireItem,
): { player: T; inventory: InventoryState } {
  const wornId = player.equipment.outfit;
  const worn = wornId == null ? undefined : tryResolve(wornId, resolve);
  const wornDye = normalizeDye(worn, player.equipment.outfitDye);

  const stacks = inventory.stacks.map((stack) => {
    if (stack.dye === undefined) return stack;
    const kept = normalizeDye(tryResolve(stack.itemId, resolve), stack.dye);
    const next: ItemStack = { ...stack };
    delete next.dye;
    if (kept) next.dye = kept;
    return next;
  });

  return {
    player: {
      ...player,
      equipment: { ...player.equipment, outfitDye: wornDye },
    },
    inventory: { stacks },
  };
}
