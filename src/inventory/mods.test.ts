import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { CRITICAL_DAMAGE_SHARE } from "../combat/damage";
import { getItem, requireItem } from "../data/items";
import { equip, equipStack, unequip } from "./equipment";
import { addGear, addItem, emptyInventory } from "./inventory";
import { InventoryError, type ModItem, type WeaponItem } from "./items";
import {
  CRIT_SHARE_BASE,
  MAX_CRIT_SHARE,
  MIN_CRIT_SHARE,
  installMod,
  installedMods,
  modAccent,
  normalizeMods,
  removeMod,
  sanitizeMods,
  storedMods,
  weaponProfile,
  weaponSockets,
} from "./mods";

/** The tier-2 rail pistol: two sockets, barrel then core. */
function railSpitter(): WeaponItem {
  const item = requireItem("wpn-rail-spitter");
  if (item.kind !== "weapon") throw new Error("fixture is not a weapon");
  return item;
}

function mod(id: string): ModItem {
  const item = requireItem(id);
  if (item.kind !== "mod") throw new Error(`${id} is not a mod`);
  return item;
}

describe("weapon sockets", () => {
  it("gives tier-2 weapons two sockets and starters one", () => {
    expect(weaponSockets(railSpitter())).toEqual(["barrel", "core"]);
    const knife = requireItem("wpn-shard-knife");
    if (knife.kind !== "weapon") throw new Error("not a weapon");
    expect(weaponSockets(knife)).toEqual(["grip"]);
  });

  it("fits a part into a socket of its own kind", () => {
    const mods = installMod(railSpitter(), [], 0, "mod-lattice-rifling");
    expect(mods).toEqual(["mod-lattice-rifling", null]);
  });

  it("refuses a part whose kind the socket does not take", () => {
    // The gyro sleeve is a grip part; the rail spitter has no grip.
    expect(() =>
      installMod(railSpitter(), [], 0, "mod-gyro-sleeve"),
    ).toThrowError(
      expect.objectContaining({ code: "wrong-socket" }) as Error,
    );
  });

  it("refuses a socket the weapon does not have", () => {
    expect(() =>
      installMod(railSpitter(), [], 2, "mod-lattice-rifling"),
    ).toThrowError(
      expect.objectContaining({ code: "unknown-socket" }) as Error,
    );
  });

  it("refuses any part at all on a weapon with no sockets", () => {
    const socketless: WeaponItem = { ...railSpitter(), sockets: [] };
    expect(() =>
      installMod(socketless, [], 0, "mod-lattice-rifling"),
    ).toThrowError(expect.objectContaining({ code: "no-sockets" }) as Error);
  });

  it("holds one part per socket", () => {
    const fitted = installMod(railSpitter(), [], 0, "mod-lattice-rifling");
    expect(() =>
      installMod(railSpitter(), fitted, 0, "mod-smartlink-sight"),
    ).toThrowError(
      expect.objectContaining({ code: "socket-occupied" }) as Error,
    );
  });

  it("refuses an item that is not a part at all", () => {
    expect(() =>
      installMod(railSpitter(), [], 0, "con-trauma-patch"),
    ).toThrowError(expect.objectContaining({ code: "wrong-kind" }) as Error);
  });

  it("gives the part back intact when it is pulled", () => {
    const fitted = installMod(railSpitter(), [], 0, "mod-lattice-rifling");
    const pulled = removeMod(railSpitter(), fitted, 0);
    expect(pulled.modId).toBe("mod-lattice-rifling");
    expect(pulled.mods).toEqual([null, null]);
  });

  it("refuses to pull from an empty socket", () => {
    expect(() => removeMod(railSpitter(), [], 1)).toThrowError(
      expect.objectContaining({ code: "socket-empty" }) as Error,
    );
  });

  it("never mutates the slots it is handed", () => {
    const before: (string | null)[] = [null, null];
    installMod(railSpitter(), before, 0, "mod-lattice-rifling");
    expect(before).toEqual([null, null]);
  });
});

describe("normalizeMods", () => {
  it("is exactly one entry per socket, whatever it was handed", () => {
    expect(normalizeMods(railSpitter(), undefined)).toEqual([null, null]);
    expect(
      normalizeMods(railSpitter(), ["mod-lattice-rifling", null, "extra"]),
    ).toEqual(["mod-lattice-rifling", null]);
  });

  it("drops a part that no longer belongs rather than throwing", () => {
    // Unknown id, wrong kind, and a part in the wrong socket kind all
    // come back as an empty socket — that is what lets an old save load.
    expect(normalizeMods(railSpitter(), ["mod-was-deleted", null])).toEqual([
      null,
      null,
    ]);
    expect(normalizeMods(railSpitter(), ["con-trauma-patch", null])).toEqual([
      null,
      null,
    ]);
    expect(normalizeMods(railSpitter(), ["mod-gyro-sleeve", null])).toEqual([
      null,
      null,
    ]);
  });

  it("stores an all-empty set as nothing at all", () => {
    expect(storedMods([null, null])).toBeUndefined();
    expect(storedMods(["mod-lattice-rifling", null])).toEqual([
      "mod-lattice-rifling",
      null,
    ]);
  });
});

describe("weaponProfile", () => {
  it("is the bare weapon when nothing is fitted", () => {
    expect(weaponProfile(railSpitter(), [])).toEqual({
      name: "Rail Spitter",
      damage: 8,
      rangeType: "ranged",
    });
  });

  it("folds each effect kind into its own figure", () => {
    const profile = weaponProfile(railSpitter(), [
      mod("mod-splitbore-choke"),
      mod("mod-lattice-rifling"),
    ]);
    expect(profile.damage).toBe(10);
    expect(profile.accuracy).toBe(-1);
    expect(profile.armorPierce).toBe(2);
  });

  it("sums parts that move the same figure", () => {
    const profile = weaponProfile(railSpitter(), [
      mod("mod-splitbore-choke"),
      mod("mod-smartlink-sight"),
    ]);
    expect(profile.damage).toBe(8 + 2 - 1);
    expect(profile.accuracy).toBe(-1 + 3);
  });

  it("leaves a figure nothing moved absent, not zero", () => {
    const profile = weaponProfile(railSpitter(), [mod("mod-lattice-rifling")]);
    expect(profile.accuracy).toBeUndefined();
    expect(profile.rangeBonus).toBeUndefined();
    expect(profile.critShare).toBeUndefined();
  });

  it("shifts the critical line off the same base the combat math uses", () => {
    expect(CRIT_SHARE_BASE).toBe(CRITICAL_DAMAGE_SHARE);
    const profile = weaponProfile(railSpitter(), [mod("mod-hairline-sear")]);
    expect(profile.critShare).toBeCloseTo(CRIT_SHARE_BASE - 0.09, 10);
  });

  it("floors damage at 1 and bounds the critical line", () => {
    const heavy: ModItem = {
      ...mod("mod-smartlink-sight"),
      effects: [
        { type: "weapon-damage", amount: -50 },
        { type: "crit-share", amount: -5 },
      ],
    };
    const profile = weaponProfile(railSpitter(), [heavy]);
    expect(profile.damage).toBe(1);
    expect(profile.critShare).toBe(MIN_CRIT_SHARE);

    const dull: ModItem = {
      ...heavy,
      effects: [{ type: "crit-share", amount: 5 }],
    };
    expect(weaponProfile(railSpitter(), [dull]).critShare).toBe(MAX_CRIT_SHARE);
  });

  it("ignores the character-facing half of a part's effects", () => {
    const knife = requireItem("wpn-shard-knife");
    if (knife.kind !== "weapon") throw new Error("not a weapon");
    // The gyro sleeve is stats only; the weapon's own figures stand.
    expect(weaponProfile(knife, [mod("mod-gyro-sleeve")])).toEqual({
      name: "Shard Knife",
      damage: 4,
      rangeType: "melee",
    });
  });
});

describe("installedMods and accents", () => {
  it("reads the fitted parts back in socket order", () => {
    const fitted = installMod(
      railSpitter(),
      installMod(railSpitter(), [], 0, "mod-smartlink-sight"),
      1,
      "mod-burst-governor",
    );
    expect(installedMods(railSpitter(), fitted).map((m) => m.id)).toEqual([
      "mod-smartlink-sight",
      "mod-burst-governor",
    ]);
  });

  it("wears the first fitted accent, in socket order", () => {
    const both = ["mod-smartlink-sight", "mod-burst-governor"];
    expect(modAccent(railSpitter(), both, getItem)).toBe("hologramBlue");
    expect(
      modAccent(railSpitter(), [null, "mod-burst-governor"], getItem),
    ).toBe("hazardAmber");
    expect(modAccent(railSpitter(), [null, null], getItem)).toBeUndefined();
  });

  it("gives every authored part a visible accent", () => {
    // A modded weapon has to read as modded — that is the whole of the
    // visual contract (see modAccent / resolveLayers).
    for (const item of [
      "mod-splitbore-choke",
      "mod-lattice-rifling",
      "mod-smartlink-sight",
      "mod-longspar-extension",
      "mod-burst-governor",
      "mod-hairline-sear",
      "mod-gyro-sleeve",
      "mod-ballast-shim",
    ]) {
      expect(mod(item).accent, item).toBeDefined();
    }
  });
});

describe("sanitizeMods", () => {
  it("leaves an unmodded loadout byte-identical", () => {
    const player = fixtureCharacter();
    const inventory = addItem(emptyInventory(), "con-trauma-patch", 2);
    const cleaned = sanitizeMods(player, inventory);
    expect(cleaned.inventory).toEqual(inventory);
    expect(cleaned.player.equipment.weaponMods).toBeUndefined();
  });

  it("drops a part a weapon no longer has room for, in hand and in bag", () => {
    const base = fixtureCharacter();
    const player = {
      ...base,
      equipment: {
        ...base.equipment,
        weapon: "wpn-rail-spitter",
        // A grip part in a weapon that offers no grip socket.
        weaponMods: ["mod-gyro-sleeve", "mod-burst-governor"],
      },
    };
    const inventory = addGear(emptyInventory(), "wpn-torque-cleaver", [
      "mod-lattice-rifling",
      "mod-gyro-sleeve",
    ]);
    const cleaned = sanitizeMods(player, inventory);
    expect(cleaned.player.equipment.weaponMods).toEqual([
      null,
      "mod-burst-governor",
    ]);
    // The cleaver's sockets are core then grip: the barrel part goes,
    // the grip part stays.
    expect(cleaned.inventory.stacks[0]?.mods).toEqual([
      null,
      "mod-gyro-sleeve",
    ]);
  });
});

describe("parts travel with the copy they are fitted to", () => {
  it("moves onto the character when the weapon is equipped", () => {
    const player = fixtureCharacter();
    const inventory = addGear(emptyInventory(), "wpn-shard-knife", [
      "mod-gyro-sleeve",
    ]);
    const loadout = equip(player, inventory, "wpn-shard-knife");
    expect(loadout.character.equipment.weaponMods).toEqual([
      "mod-gyro-sleeve",
    ]);
    expect(loadout.inventory.stacks).toEqual([]);
  });

  it("comes back off it, still fitted, when the weapon is put away", () => {
    const player = fixtureCharacter();
    const equipped = equip(
      player,
      addGear(emptyInventory(), "wpn-shard-knife", ["mod-gyro-sleeve"]),
      "wpn-shard-knife",
    );
    const stowed = unequip(equipped.character, equipped.inventory, "weapon");
    expect(stowed.character.equipment.weaponMods).toBeUndefined();
    expect(stowed.inventory.stacks).toEqual([
      { itemId: "wpn-shard-knife", quantity: 1, mods: ["mod-gyro-sleeve"] },
    ]);
  });

  it("keeps two copies of one weapon apart", () => {
    const player = fixtureCharacter();
    let inventory = addGear(emptyInventory(), "wpn-shard-knife", [
      "mod-gyro-sleeve",
    ]);
    inventory = addGear(inventory, "wpn-shard-knife", []);
    // Equipping the *second* copy must not take the first one's part.
    const loadout = equipStack(player, inventory, 1);
    expect(loadout.character.equipment.weaponMods).toBeUndefined();
    expect(loadout.inventory.stacks).toEqual([
      { itemId: "wpn-shard-knife", quantity: 1, mods: ["mod-gyro-sleeve"] },
    ]);
  });

  it("refuses to hang per-copy state on something that stacks", () => {
    expect(() =>
      addGear(emptyInventory(), "con-trauma-patch", []),
    ).toThrowError(InventoryError);
  });
});
