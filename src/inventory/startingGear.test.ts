import { describe, expect, it } from "vitest";
import { createCharacter, defaultAllocation } from "../character";
import { backgrounds, getBackground } from "../data/backgrounds";
import { emptyInventory } from "./inventory";
import type { Item } from "./items";
import {
  applyStartingGear,
  resolveStartingGear,
  startingEquipment,
} from "./startingGear";

function makeCharacter(backgroundId: string) {
  return createCharacter({
    name: "Vex",
    background: getBackground(backgroundId)!,
    allocation: defaultAllocation(),
  });
}

describe("resolveStartingGear", () => {
  it("resolves every background's starting gear ids to real items", () => {
    for (const background of backgrounds) {
      const gear = resolveStartingGear(background);
      expect(gear.map((item) => item.id)).toEqual(background.startingGearIds);
    }
  });
});

describe("startingEquipment", () => {
  it("matches the slots applyStartingGear equips for every background", () => {
    for (const background of backgrounds) {
      const { character } = applyStartingGear(
        makeCharacter(background.id),
        emptyInventory(),
      );
      expect(startingEquipment(background)).toEqual(character.equipment);
    }
  });

  it("takes the first weapon and outfit and skips other kinds", () => {
    const stub = (id: string): Item =>
      ({
        id,
        name: id,
        description: "",
        kind: id.startsWith("wpn-")
          ? "weapon"
          : id.startsWith("out-")
            ? "outfit"
            : "consumable",
      }) as Item;
    const background = {
      ...backgrounds[0]!,
      startingGearIds: ["med-patch", "wpn-first", "out-first", "wpn-second"],
    };
    expect(startingEquipment(background, stub)).toEqual({
      weapon: "wpn-first",
      outfit: "out-first",
      enhancements: {},
    });
  });
});

describe("applyStartingGear", () => {
  it("equips each background's starting weapon and outfit", () => {
    for (const background of backgrounds) {
      const { character, inventory } = applyStartingGear(
        makeCharacter(background.id),
        emptyInventory(),
      );
      const weapon = background.startingGearIds.find((id) =>
        id.startsWith("wpn-"),
      );
      const outfit = background.startingGearIds.find((id) =>
        id.startsWith("out-"),
      );
      expect(character.equipment.weapon).toBe(weapon);
      expect(character.equipment.outfit).toBe(outfit);
      // Both pieces are equipped, so nothing is left loose in the pack.
      expect(inventory.stacks).toEqual([]);
    }
  });

  it("leaves occupied slots alone and keeps the item in the inventory", () => {
    const base = applyStartingGear(
      makeCharacter("gutter-courier"),
      emptyInventory(),
    );
    // Applying again grants a second copy but does not re-equip.
    const again = applyStartingGear(base.character, base.inventory);
    expect(again.character.equipment.weapon).toBe("wpn-shard-knife");
    expect(again.inventory.stacks).toEqual([
      { itemId: "wpn-shard-knife", quantity: 1 },
      { itemId: "out-courier-slicker", quantity: 1 },
    ]);
  });

  it("throws for a character with an unknown background", () => {
    const character = {
      ...makeCharacter("gutter-courier"),
      backgroundId: "no-such-background",
    };
    expect(() => applyStartingGear(character, emptyInventory())).toThrowError(
      /unknown background/i,
    );
  });
});
