import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { useConsumable } from "./consume";
import { addItem, countItem, emptyInventory } from "./inventory";
import { InventoryError } from "./items";

function makeCharacter() {
  return fixtureCharacter();
}

function expectCode(fn: () => unknown, code: InventoryError["code"]) {
  try {
    fn();
    expect.unreachable("expected an InventoryError");
  } catch (error) {
    expect(error).toBeInstanceOf(InventoryError);
    expect((error as InventoryError).code).toBe(code);
  }
}

describe("useConsumable", () => {
  it("heals the character and removes the item", () => {
    const character = { ...makeCharacter(), hp: 5 };
    const inv = addItem(emptyInventory(), "con-trauma-patch", 2);
    const result = useConsumable(character, inv, "con-trauma-patch");
    expect(result.character.hp).toBe(15);
    expect(countItem(result.inventory, "con-trauma-patch")).toBe(1);
  });

  it("clamps healing at max hp", () => {
    const character = makeCharacter();
    const nearlyFull = { ...character, hp: character.derived.maxHp - 1 };
    const inv = addItem(emptyInventory(), "con-trauma-patch");
    const result = useConsumable(nearlyFull, inv, "con-trauma-patch");
    expect(result.character.hp).toBe(character.derived.maxHp);
  });

  it("rejects use at full health so the item is not wasted", () => {
    const inv = addItem(emptyInventory(), "con-trauma-patch");
    expectCode(
      () => useConsumable(makeCharacter(), inv, "con-trauma-patch"),
      "not-usable",
    );
  });

  it("rejects combat-only boosts outside combat", () => {
    const character = { ...makeCharacter(), hp: 5 };
    const inv = addItem(emptyInventory(), "con-surge-stim");
    expectCode(
      () => useConsumable(character, inv, "con-surge-stim"),
      "not-usable",
    );
  });

  it("rejects non-consumable items", () => {
    const character = { ...makeCharacter(), hp: 5 };
    const inv = addItem(emptyInventory(), "wpn-shard-knife");
    expectCode(
      () => useConsumable(character, inv, "wpn-shard-knife"),
      "wrong-kind",
    );
  });

  it("rejects items that are not carried", () => {
    const character = { ...makeCharacter(), hp: 5 };
    expectCode(
      () => useConsumable(character, emptyInventory(), "con-trauma-patch"),
      "not-carried",
    );
  });
});
