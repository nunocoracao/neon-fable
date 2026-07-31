import { beforeEach, describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { equip } from "./equipment";
import { addGear, addItem, emptyInventory } from "./inventory";
import { MOD_REMOVAL_FEE } from "./mods";
import { equippedWeaponProfile } from "./selectors";
import {
  benchWeapons,
  fitMod,
  fittableMods,
  previewFit,
  previewPull,
  pullMod,
  requireBenchWeapon,
  type Workbench,
} from "./workbench";

/**
 * A bench with a rail spitter in hand (barrel + core sockets), a
 * torque cleaver in the bag (core + grip), and one of every part the
 * two of them could take.
 */
function makeBench(credits = 500): Workbench {
  const base: CharacterState = fixtureCharacter();
  // Enough Reflexes to hold the tier-2 pistol.
  const character: CharacterState = {
    ...base,
    stats: { ...base.stats, reflexes: 8, body: 8 },
  };
  let inventory = addGear(emptyInventory(), "wpn-rail-spitter", {});
  inventory = addGear(inventory, "wpn-torque-cleaver", {});
  for (const modId of [
    "mod-lattice-rifling",
    "mod-smartlink-sight",
    "mod-burst-governor",
    "mod-gyro-sleeve",
  ]) {
    inventory = addItem(inventory, modId, 1);
  }
  const held = equip(character, inventory, "wpn-rail-spitter");
  return { character: held.character, inventory: held.inventory, credits };
}

let bench: Workbench;
beforeEach(() => {
  bench = makeBench();
});

describe("the rack", () => {
  it("offers the weapon in hand first, then every carried copy", () => {
    const rack = benchWeapons(bench);
    expect(rack.map((w) => [w.ref.where, w.item.id])).toEqual([
      ["equipped", "wpn-rail-spitter"],
      ["carried", "wpn-torque-cleaver"],
    ]);
  });

  it("reports each weapon's figures as they stand", () => {
    const [held] = benchWeapons(bench);
    expect(held?.profile).toEqual({
      name: "Rail Spitter",
      damage: 8,
      rangeType: "ranged",
    });
    expect(held?.mods).toEqual([null, null]);
  });

  it("refuses a reference to a weapon that is not on it", () => {
    expect(() =>
      requireBenchWeapon(bench, { where: "carried", stackIndex: 99 }),
    ).toThrowError(expect.objectContaining({ code: "not-carried" }) as Error);
  });

  it("lists only the parts that fit the socket kind asked about", () => {
    expect(fittableMods(bench, "barrel").map((r) => r.modId)).toEqual([
      "mod-lattice-rifling",
      "mod-smartlink-sight",
    ]);
    expect(fittableMods(bench, "grip").map((r) => r.modId)).toEqual([
      "mod-gyro-sleeve",
    ]);
  });
});

describe("fitting", () => {
  it("takes the part out of the bag and puts it on the weapon", () => {
    const after = fitMod(bench, { where: "equipped" }, 0, "mod-lattice-rifling");
    expect(after.character.equipment.weaponMods).toEqual([
      "mod-lattice-rifling",
      null,
    ]);
    expect(
      after.inventory.stacks.some((s) => s.itemId === "mod-lattice-rifling"),
    ).toBe(false);
  });

  it("costs nothing to fit", () => {
    const after = fitMod(bench, { where: "equipped" }, 0, "mod-smartlink-sight");
    expect(after.credits).toBe(bench.credits);
  });

  it("refuses a part the player is not carrying", () => {
    expect(() =>
      fitMod(bench, { where: "equipped" }, 0, "mod-splitbore-choke"),
    ).toThrowError(expect.objectContaining({ code: "not-carried" }) as Error);
  });

  it("leaves nothing moved when the socket rules refuse it", () => {
    expect(() =>
      fitMod(bench, { where: "equipped" }, 0, "mod-gyro-sleeve"),
    ).toThrowError(expect.objectContaining({ code: "wrong-socket" }) as Error);
    // The part is still in the bag: a refused fitting is a no-op.
    expect(
      bench.inventory.stacks.some((s) => s.itemId === "mod-gyro-sleeve"),
    ).toBe(true);
  });

  it("works on a carried copy without touching the one in hand", () => {
    const after = fitMod(
      bench,
      { where: "carried", stackIndex: 0 },
      1,
      "mod-gyro-sleeve",
    );
    expect(after.character.equipment.weaponMods).toBeUndefined();
    expect(after.inventory.stacks[0]).toEqual({
      itemId: "wpn-torque-cleaver",
      quantity: 1,
      mods: [null, "mod-gyro-sleeve"],
    });
  });
});

describe("pulling", () => {
  it("charges the fee and gives the part back intact", () => {
    const fitted = fitMod(
      bench,
      { where: "equipped" },
      0,
      "mod-lattice-rifling",
    );
    const pulled = pullMod(fitted, { where: "equipped" }, 0);
    expect(pulled.credits).toBe(bench.credits - MOD_REMOVAL_FEE);
    expect(pulled.character.equipment.weaponMods).toBeUndefined();
    expect(
      pulled.inventory.stacks.some((s) => s.itemId === "mod-lattice-rifling"),
    ).toBe(true);
  });

  it("refuses when the fee is more than the player carries", () => {
    const poor = {
      ...fitMod(bench, { where: "equipped" }, 0, "mod-lattice-rifling"),
      credits: MOD_REMOVAL_FEE - 1,
    };
    expect(() => pullMod(poor, { where: "equipped" }, 0)).toThrowError(
      expect.objectContaining({ code: "insufficient-credits" }) as Error,
    );
  });

  it("charges nothing for an empty socket — it refuses first", () => {
    expect(() => pullMod(bench, { where: "equipped" }, 1)).toThrowError(
      expect.objectContaining({ code: "socket-empty" }) as Error,
    );
  });
});

describe("previews", () => {
  it("quotes the figures the fitting will actually produce", () => {
    const preview = previewFit(
      bench,
      { where: "equipped" },
      0,
      "mod-smartlink-sight",
    );
    expect(preview?.deltas).toEqual([
      { field: "damage", before: 8, after: 7 },
      { field: "accuracy", before: 0, after: 3 },
    ]);
    // Committing it lands exactly on the previewed profile.
    const after = fitMod(bench, { where: "equipped" }, 0, "mod-smartlink-sight");
    expect(equippedWeaponProfile(after.character)).toEqual(preview?.after);
  });

  it("says nothing at all about a fitting that would be refused", () => {
    expect(
      previewFit(bench, { where: "equipped" }, 0, "mod-gyro-sleeve"),
    ).toBeNull();
    expect(previewPull(bench, { where: "equipped" }, 0)).toBeNull();
  });

  it("previews a pull as the loss it is", () => {
    const fitted = fitMod(
      bench,
      { where: "equipped" },
      0,
      "mod-lattice-rifling",
    );
    const preview = previewPull(fitted, { where: "equipped" }, 0);
    expect(preview?.modId).toBe("mod-lattice-rifling");
    expect(preview?.deltas).toEqual([
      { field: "armorPierce", before: 2, after: 0 },
    ]);
    const pulled = pullMod(fitted, { where: "equipped" }, 0);
    expect(equippedWeaponProfile(pulled.character)).toEqual(preview?.after);
  });
});
