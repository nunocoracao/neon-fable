import { describe, expect, it } from "vitest";
import { createCharacter, defaultAllocation, type Stats } from "../character";
import { getBackground } from "../data/backgrounds";
import {
  UNINSTALL_TRAUMA_PER_LOAD,
  equip,
  installEnhancement,
  unequip,
  uninstallEnhancement,
} from "./equipment";
import { addItem, countItem, emptyInventory, hasItem } from "./inventory";
import { InventoryError } from "./items";

function makeCharacter(allocation: Stats = defaultAllocation()) {
  return createCharacter({
    name: "Vex",
    background: getBackground("gutter-courier")!,
    allocation,
  });
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

/** Valid point-buy spread that leaves reflexes at the minimum. */
const slowAllocation: Stats = {
  body: 10,
  reflexes: 3,
  tech: 6,
  cool: 6,
  intelligence: 5,
};

describe("equip", () => {
  it("moves a carried weapon into the weapon slot", () => {
    const inv = addItem(emptyInventory(), "wpn-shard-knife");
    const { character, inventory } = equip(makeCharacter(), inv, "wpn-shard-knife");
    expect(character.equipment.weapon).toBe("wpn-shard-knife");
    expect(hasItem(inventory, "wpn-shard-knife")).toBe(false);
  });

  it("returns the previously equipped item to the inventory", () => {
    let inv = addItem(emptyInventory(), "wpn-shard-knife");
    inv = addItem(inv, "wpn-stun-baton");
    let loadout = equip(makeCharacter(), inv, "wpn-shard-knife");
    loadout = equip(loadout.character, loadout.inventory, "wpn-stun-baton");
    expect(loadout.character.equipment.weapon).toBe("wpn-stun-baton");
    expect(countItem(loadout.inventory, "wpn-shard-knife")).toBe(1);
  });

  it("equips outfits into their own slot", () => {
    const inv = addItem(emptyInventory(), "out-spire-suit");
    const { character } = equip(makeCharacter(), inv, "out-spire-suit");
    expect(character.equipment.outfit).toBe("out-spire-suit");
    expect(character.equipment.weapon).toBeNull();
  });

  it("rejects items that are not carried", () => {
    expectCode(
      () => equip(makeCharacter(), emptyInventory(), "wpn-shard-knife"),
      "not-carried",
    );
  });

  it("rejects kinds that do not go in equipment slots", () => {
    const inv = addItem(emptyInventory(), "con-trauma-patch");
    expectCode(() => equip(makeCharacter(), inv, "con-trauma-patch"), "wrong-kind");
  });

  it("rejects a weapon whose stat requirement is not met", () => {
    const character = makeCharacter(slowAllocation); // reflexes 4 after bonuses
    const inv = addItem(emptyInventory(), "wpn-compact-pistol");
    expectCode(() => equip(character, inv, "wpn-compact-pistol"), "stat-requirement");
  });

  it("counts equipment stat mods toward weapon requirements", () => {
    const character = makeCharacter(slowAllocation); // reflexes 4 after bonuses
    let inv = addItem(emptyInventory(), "out-courier-slicker"); // +1 reflexes
    inv = addItem(inv, "wpn-compact-pistol"); // requires reflexes 5
    let loadout = equip(character, inv, "out-courier-slicker");
    loadout = equip(loadout.character, loadout.inventory, "wpn-compact-pistol");
    expect(loadout.character.equipment.weapon).toBe("wpn-compact-pistol");
  });
});

describe("unequip", () => {
  it("returns the slotted item to the inventory", () => {
    const inv = addItem(emptyInventory(), "wpn-shard-knife");
    const equipped = equip(makeCharacter(), inv, "wpn-shard-knife");
    const { character, inventory } = unequip(
      equipped.character,
      equipped.inventory,
      "weapon",
    );
    expect(character.equipment.weapon).toBeNull();
    expect(countItem(inventory, "wpn-shard-knife")).toBe(1);
  });

  it("throws 'not-equipped' on an empty slot", () => {
    expectCode(
      () => unequip(makeCharacter(), emptyInventory(), "outfit"),
      "not-equipped",
    );
  });
});

describe("installEnhancement", () => {
  it("installs into the matching cyber slot and tracks neural load", () => {
    const inv = addItem(emptyInventory(), "cyb-optic-suite");
    const { character, inventory } = installEnhancement(
      makeCharacter(),
      inv,
      "cyb-optic-suite",
    );
    expect(character.equipment.enhancements.eyes).toBe("cyb-optic-suite");
    expect(character.neuralLoad).toBe(2);
    expect(hasItem(inventory, "cyb-optic-suite")).toBe(false);
  });

  it("enforces one enhancement per install slot", () => {
    let inv = addItem(emptyInventory(), "cyb-optic-suite", 2);
    const first = installEnhancement(makeCharacter(), inv, "cyb-optic-suite");
    expectCode(
      () => installEnhancement(first.character, first.inventory, "cyb-optic-suite"),
      "slot-occupied",
    );
  });

  it("rejects installs past neural capacity", () => {
    // Gutter courier at the default spread: capacity floor((7 + 6) / 2) = 6.
    let inv = addItem(emptyInventory(), "cyb-optic-suite");
    inv = addItem(inv, "cyb-myomer-arms");
    inv = addItem(inv, "cyb-lattice-coprocessor");
    let loadout = installEnhancement(makeCharacter(), inv, "cyb-optic-suite");
    loadout = installEnhancement(
      loadout.character,
      loadout.inventory,
      "cyb-myomer-arms",
    );
    expect(loadout.character.neuralLoad).toBe(5);
    expectCode(
      () =>
        installEnhancement(
          loadout.character,
          loadout.inventory,
          "cyb-lattice-coprocessor",
        ),
      "neural-capacity",
    );
  });

  it("rejects non-enhancement items", () => {
    const inv = addItem(emptyInventory(), "wpn-shard-knife");
    expectCode(
      () => installEnhancement(makeCharacter(), inv, "wpn-shard-knife"),
      "wrong-kind",
    );
  });
});

describe("uninstallEnhancement", () => {
  function installed() {
    const inv = addItem(emptyInventory(), "cyb-myomer-arms");
    return installEnhancement(makeCharacter(), inv, "cyb-myomer-arms");
  }

  it("frees neural load, destroys the implant, and costs HP", () => {
    const before = installed();
    const { character, inventory } = uninstallEnhancement(
      before.character,
      before.inventory,
      "arms",
    );
    expect(character.equipment.enhancements.arms).toBeUndefined();
    expect(character.neuralLoad).toBe(0);
    expect(character.hp).toBe(before.character.hp - 3 * UNINSTALL_TRAUMA_PER_LOAD);
    expect(hasItem(inventory, "cyb-myomer-arms")).toBe(false);
  });

  it("never drops HP below 1", () => {
    const before = installed();
    const wounded = { ...before.character, hp: 2 };
    const { character } = uninstallEnhancement(wounded, before.inventory, "arms");
    expect(character.hp).toBe(1);
  });

  it("throws 'not-installed' on an empty slot", () => {
    expectCode(
      () => uninstallEnhancement(makeCharacter(), emptyInventory(), "neural"),
      "not-installed",
    );
  });
});
