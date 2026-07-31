import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { CHAPEL_DYE_SHELF, chapelDyePrice } from "../data/dyes";
import {
  applyDye,
  buyAndApplyDye,
  buyDye,
  dyeableOutfits,
  isDyeable,
  normalizeDye,
  requireDyeTarget,
  sameDye,
  sameOutfit,
  sanitizeDyes,
  stripDye,
  type DyeCounter,
} from "./dye";
import { equip, equipStack, unequip } from "./equipment";
import { addGear, addItem, emptyInventory } from "./inventory";
import {
  InventoryError,
  storedDye,
  type ItemResolver,
  type OutfitDye,
  type OutfitItem,
} from "./items";
import { requireItem } from "../data/items";

/**
 * The colour rules: what a tin does to a coat, what replacing and
 * stripping mean, and the fact that all of it lives on one copy of one
 * item rather than on the character.
 */

const CINDER = { primary: "darkFabric", accent: "hazardAmber" } as const;
const CYAN = { accent: "neonCyan" } as const;

/**
 * A coat with no sprite layer of its own. Every authored outfit carries
 * one, so the "nothing to dye" rule needs a fixture to have anything to
 * refuse — which is what the injectable resolver is for.
 */
const PLAIN_COAT: OutfitItem = {
  id: "out-plain-wrap",
  kind: "outfit",
  name: "Plain Wrap",
  description: "Cloth, and not much of it.",
  armor: 1,
  effects: [],
};

const resolve: ItemResolver = (id) =>
  id === PLAIN_COAT.id ? PLAIN_COAT : requireItem(id);

/** A runner wearing the courier slicker, with tins in the bag. */
function counterWith(
  tins: string[] = [],
  credits = 200,
  outfitId = "out-courier-slicker",
): DyeCounter {
  const character = equip(
    fixtureCharacter(),
    addGear(emptyInventory(), outfitId, {}, resolve),
    outfitId,
    resolve,
  );
  let inventory = character.inventory;
  for (const id of tins) inventory = addItem(inventory, id, 1);
  return { character: character.character, inventory, credits };
}

const worn = { where: "equipped" } as const;

describe("what can hold a colour", () => {
  it("takes any outfit carrying a sprite layer of its own", () => {
    const counter = counterWith();
    expect(isDyeable(requireDyeTarget(counter, worn).item)).toBe(true);
    // Every authored outfit qualifies; the dye counter never has to
    // explain itself to a real coat.
    expect(isDyeable(requireItem("out-cordon-plate"))).toBe(true);
    expect(isDyeable(requireItem("con-trauma-patch"))).toBe(false);
  });

  it("refuses an outfit with no cloth of its own", () => {
    const bare = counterWith(["dye-cinder-black"], 200, PLAIN_COAT.id);
    expect(requireDyeTarget(bare, worn, resolve).dyeable).toBe(false);
    expect(() =>
      applyDye(bare, worn, "dye-cinder-black", resolve),
    ).toThrowError(/no cloth/);
    // And the refusal spent nothing.
    expect(bare.inventory.stacks[0]?.itemId).toBe("dye-cinder-black");
  });

  it("refuses anything that is not a dye", () => {
    const counter = counterWith(["con-trauma-patch"]);
    expect(() => applyDye(counter, worn, "con-trauma-patch")).toThrowError(
      /not a dye/,
    );
  });

  it("names the coat that is not there", () => {
    const bare: DyeCounter = {
      character: fixtureCharacter(),
      inventory: emptyInventory(),
      credits: 0,
    };
    expect(() => requireDyeTarget(bare, worn)).toThrowError(/No outfit worn/);
    expect(() =>
      requireDyeTarget(bare, { where: "carried", stackIndex: 3 }),
    ).toThrowError(/carried stack 3/);
  });
});

describe("applying, replacing, stripping", () => {
  it("writes the tin's channels onto the coat and uses the tin up", () => {
    const before = counterWith(["dye-cinder-black"]);
    const after = applyDye(before, worn, "dye-cinder-black");
    expect(after.character.equipment.outfitDye).toEqual(CINDER);
    expect(after.inventory.stacks).toHaveLength(0);
    // Pure: the counter it was handed is untouched.
    expect(before.character.equipment.outfitDye).toBeUndefined();
    expect(before.inventory.stacks).toHaveLength(1);
  });

  it("replaces rather than layers when a second tin goes on", () => {
    let counter = counterWith(["dye-cinder-black", "dye-signal-cyan"]);
    counter = applyDye(counter, worn, "dye-cinder-black");
    counter = applyDye(counter, worn, "dye-signal-cyan");
    // Only the cyan trim survives — the black cloth channel is gone,
    // not merged under it.
    expect(counter.character.equipment.outfitDye).toEqual(CYAN);
  });

  it("strips back to factory colours for free", () => {
    let counter = counterWith(["dye-cinder-black"]);
    counter = applyDye(counter, worn, "dye-cinder-black");
    const credits = counter.credits;
    counter = stripDye(counter, worn);
    expect(counter.character.equipment.outfitDye).toBeUndefined();
    expect(counter.credits).toBe(credits);
    // And the tin does not come back.
    expect(counter.inventory.stacks).toHaveLength(0);
  });

  it("refuses to strip a coat wearing its factory colours", () => {
    expect(() => stripDye(counterWith(), worn)).toThrowError(/factory/);
  });

  it("refuses a tin the player is not carrying, changing nothing", () => {
    const counter = counterWith();
    expect(() => applyDye(counter, worn, "dye-cinder-black")).toThrowError(
      InventoryError,
    );
    expect(counter.character.equipment.outfitDye).toBeUndefined();
  });

  it("dyes a coat in the bag without touching the one being worn", () => {
    let counter = counterWith(["dye-signal-cyan"]);
    counter = {
      ...counter,
      inventory: addGear(counter.inventory, "out-spire-suit", {}),
    };
    const carried = counter.inventory.stacks.findIndex(
      (stack) => stack.itemId === "out-spire-suit",
    );
    const after = applyDye(
      counter,
      { where: "carried", stackIndex: carried },
      "dye-signal-cyan",
    );
    // Spending the tin closes its stack, so the coat has moved; the
    // colour went on the copy that was named, not on whatever ends up
    // at that index afterwards.
    expect(
      after.inventory.stacks.find((s) => s.itemId === "out-spire-suit")?.dye,
    ).toEqual(CYAN);
    expect(after.character.equipment.outfitDye).toBeUndefined();
  });
});

describe("buying colour", () => {
  it("takes the shelf price and puts the tin in the bag", () => {
    const price = chapelDyePrice("dye-cinder-black") ?? 0;
    const counter = buyDye(counterWith([], 100), "dye-cinder-black", price);
    expect(counter.credits).toBe(100 - price);
    expect(counter.inventory.stacks[0]).toEqual({
      itemId: "dye-cinder-black",
      quantity: 1,
    });
  });

  it("refuses a purchase the player cannot cover", () => {
    const counter = counterWith([], 5);
    expect(() => buyDye(counter, "dye-cinder-black", 45)).toThrowError(
      /45 cr/,
    );
  });

  it("buys and applies in one gesture, charging only for the tin", () => {
    const before = counterWith([], 100);
    const after = buyAndApplyDye(before, worn, "dye-cinder-black", 45);
    expect(after.credits).toBe(55);
    expect(after.character.equipment.outfitDye).toEqual(CINDER);
    // The tin was consumed by the application, not left in the bag.
    expect(after.inventory.stacks).toHaveLength(0);
  });

  it("leaves the purse alone when there is nothing to dye", () => {
    const bare: DyeCounter = {
      character: fixtureCharacter(),
      inventory: emptyInventory(),
      credits: 100,
    };
    expect(() =>
      buyAndApplyDye(bare, worn, "dye-cinder-black", 45),
    ).toThrowError(InventoryError);
    expect(bare.credits).toBe(100);
  });

  it("prices every tin the chapel stocks, and only those", () => {
    for (const entry of CHAPEL_DYE_SHELF) {
      expect(chapelDyePrice(entry.itemId)).toBe(entry.price);
    }
    expect(chapelDyePrice("dye-last-mile")).toBeNull();
  });
});

describe("the colour rides the copy, not the character", () => {
  it("travels into the bag on unequip and back out on equip", () => {
    let counter = counterWith(["dye-cinder-black"]);
    counter = applyDye(counter, worn, "dye-cinder-black");

    const stowed = unequip(counter.character, counter.inventory, "outfit");
    expect(stowed.character.equipment.outfitDye).toBeUndefined();
    expect(stowed.inventory.stacks[0]?.dye).toEqual(CINDER);

    const back = equip(
      stowed.character,
      stowed.inventory,
      "out-courier-slicker",
    );
    expect(back.character.equipment.outfitDye).toEqual(CINDER);
    expect(back.inventory.stacks).toHaveLength(0);
  });

  it("keeps two copies of one coat apart", () => {
    let counter = counterWith(["dye-cinder-black"]);
    counter = applyDye(counter, worn, "dye-cinder-black");
    // A second, undyed slicker goes in the bag; equipping it must not
    // inherit the worn one's colour.
    const inventory = addGear(counter.inventory, "out-courier-slicker", {});
    const swapped = equipStack(counter.character, inventory, 0);
    expect(swapped.character.equipment.outfitDye).toBeUndefined();
    // And the dyed one is now the copy in the bag.
    expect(swapped.inventory.stacks[0]?.dye).toEqual(CINDER);
  });

  it("lists the worn coat first, then the bag in order", () => {
    let counter = counterWith(["dye-signal-cyan"]);
    counter = {
      ...counter,
      inventory: addGear(counter.inventory, "out-spire-suit", {}),
    };
    expect(dyeableOutfits(counter).map((coat) => coat.item.id)).toEqual([
      "out-courier-slicker",
      "out-spire-suit",
    ]);
    expect(sameOutfit(dyeableOutfits(counter)[0]!.ref, worn)).toBe(true);
  });
});

describe("storage shape and equality", () => {
  it("stores nothing for a dye that names no channel", () => {
    expect(storedDye(undefined)).toBeUndefined();
    expect(storedDye({})).toBeUndefined();
    expect(storedDye(CYAN)).toEqual(CYAN);
  });

  it("copies the channels out rather than aliasing item data", () => {
    const source = { ...CINDER };
    const stored = storedDye(source);
    expect(stored).not.toBe(source);
    expect(stored).toEqual(CINDER);
  });

  it("reads two colours as the same when they paint the same", () => {
    expect(sameDye(CINDER, { ...CINDER })).toBe(true);
    expect(sameDye(undefined, {})).toBe(true);
    expect(sameDye(CINDER, CYAN)).toBe(false);
  });

  it("serializes an undyed coat exactly as it always did", () => {
    const counter = counterWith();
    expect(
      JSON.parse(JSON.stringify(addGear(emptyInventory(), "out-spire-suit", {}))),
    ).toEqual({ stacks: [{ itemId: "out-spire-suit", quantity: 1 }] });
    expect(
      JSON.parse(JSON.stringify(counter.character.equipment)).outfitDye,
    ).toBeUndefined();
  });
});

describe("saves that outlive their content", () => {
  it("drops a colour whose material this build no longer has", () => {
    const coat = requireItem("out-courier-slicker");
    const gone = { primary: "ultraviolet" } as unknown as OutfitDye;
    expect(normalizeDye(coat, gone)).toBeUndefined();
    expect(normalizeDye(coat, CINDER)).toEqual(CINDER);
  });

  it("drops a colour sitting on something that cannot wear one", () => {
    // A worn coat with no layer, and a consumable stack that somehow
    // carries a colour: both come back clean.
    const dirty = counterWith([], 0, PLAIN_COAT.id);
    const character: CharacterState = {
      ...dirty.character,
      equipment: { ...dirty.character.equipment, outfitDye: CINDER },
    };
    const clean = sanitizeDyes(
      character,
      { stacks: [{ itemId: "con-trauma-patch", quantity: 1, dye: CINDER }] },
      resolve,
    );
    expect(clean.player.equipment.outfitDye).toBeUndefined();
    expect(clean.inventory.stacks[0]?.dye).toBeUndefined();
  });

  it("returns a wardrobe that never saw a tin unchanged", () => {
    const counter = counterWith(["con-trauma-patch"]);
    const clean = sanitizeDyes(counter.character, counter.inventory);
    expect(clean.inventory).toEqual(counter.inventory);
    expect(clean.player.equipment.outfitDye).toBeUndefined();
  });

  it("keeps a colour that is still legal", () => {
    let counter = counterWith(["dye-cinder-black"]);
    counter = applyDye(counter, worn, "dye-cinder-black");
    const clean = sanitizeDyes(counter.character, counter.inventory);
    expect(clean.player.equipment.outfitDye).toEqual(CINDER);
  });
});
