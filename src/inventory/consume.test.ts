import { describe, expect, it } from "vitest";
import { characterInjury } from "../character/injury";
import { readiedEffects } from "../character/readied";
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

describe("useConsumable — street food", () => {
  it("heals a little now and holds the rest over for the next fight", () => {
    const character = { ...makeCharacter(), hp: 5 };
    const inv = addItem(emptyInventory(), "con-cage-noodles");
    const result = useConsumable(character, inv, "con-cage-noodles");
    expect(result.character.hp).toBe(14);
    expect(readiedEffects(result.character)).toEqual([
      { family: "well-fed", stat: "reflexes", amount: 1, turns: 4 },
    ]);
    expect(countItem(result.inventory, "con-cage-noodles")).toBe(0);
  });

  it("is worth eating at full health — the lift lands either way", () => {
    const inv = addItem(emptyInventory(), "con-scrap-skewer");
    const result = useConsumable(makeCharacter(), inv, "con-scrap-skewer");
    expect(readiedEffects(result.character)).toHaveLength(1);
  });

  it("refuses to stack two meals: the second replaces the first", () => {
    let state = { character: makeCharacter(), inventory: emptyInventory() };
    state.inventory = addItem(
      addItem(state.inventory, "con-scrap-skewer"),
      "con-basin-tea",
    );
    state = useConsumable(state.character, state.inventory, "con-scrap-skewer");
    expect(readiedEffects(state.character)[0]?.stat).toBe("body");
    state = useConsumable(state.character, state.inventory, "con-basin-tea");
    // One family, one slot: eating the whole cart is worth one meal.
    expect(readiedEffects(state.character)).toEqual([
      { family: "well-fed", stat: "reflexes", amount: 1, turns: 6 },
    ]);
  });
});

describe("useConsumable — field kits", () => {
  it("closes a wound with no clinic and no fee beyond the kit", () => {
    const character = {
      ...makeCharacter(),
      hp: 5,
      injury: { id: "inj-winged", scenesLeft: 3 },
    };
    const inv = addItem(emptyInventory(), "con-splint-kit");
    const result = useConsumable(character, inv, "con-splint-kit");
    expect(characterInjury(result.character)).toBeNull();
    expect(result.character.hp).toBe(13);
  });

  it("still opens on somebody whole but wounded", () => {
    const character = {
      ...makeCharacter(),
      injury: { id: "inj-concussed", scenesLeft: 2 },
    };
    const inv = addItem(emptyInventory(), "con-splint-kit");
    const result = useConsumable(character, inv, "con-splint-kit");
    expect(characterInjury(result.character)).toBeNull();
    expect(countItem(result.inventory, "con-splint-kit")).toBe(0);
  });

  it("is not thrown away on somebody with nothing wrong with them", () => {
    const inv = addItem(emptyInventory(), "con-splint-kit");
    expectCode(
      () => useConsumable(makeCharacter(), inv, "con-splint-kit"),
      "not-usable",
    );
  });

  it("keeps the big rolls out of a fight and the wall-box kit in one", () => {
    const character = { ...makeCharacter(), hp: 5 };
    const inv = addItem(
      addItem(emptyInventory(), "con-medic-roll"),
      "con-field-kit",
    );
    expect(
      useConsumable(character, inv, "con-medic-roll").character.hp,
    ).toBe(25);
    // Both work out here; what separates them is the fight (see
    // playerConsumables in src/combat/setup.ts).
    expect(
      useConsumable(character, inv, "con-field-kit").character.hp,
    ).toBe(17);
  });
});

describe("useConsumable — context gating", () => {
  it("turns away everything that is only ever opened mid-fight", () => {
    const character = { ...makeCharacter(), hp: 5 };
    for (const itemId of ["con-kick-stim", "con-hammerhead", "con-wake-sugar"]) {
      const inv = addItem(emptyInventory(), itemId);
      expectCode(() => useConsumable(character, inv, itemId), "not-usable");
    }
  });
});
