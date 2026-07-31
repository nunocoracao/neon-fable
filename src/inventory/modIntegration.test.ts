import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { composeCharacter } from "../character/appearance";
import { composedCharacterKey } from "../iso/art/layers";
import {
  attackHitChance,
  attackDamage,
  effectiveArmor,
  weaponRange,
  weaponReach,
} from "../combat/damage";
import { attackPreview } from "../combat/preview";
import { attackOptions } from "../combat/legal";
import { makeCombat, makeCombatant } from "../combat/testSupport";
import { createCombat } from "../combat/setup";
import { encounters } from "../data/encounters";
import type { CharacterState } from "../character/create";
import type { GameState } from "../state/gameState";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
} from "../state/gameState";
import { createMemoryStorage, loadGame, saveGame } from "../state/save";
import { equip } from "./equipment";
import { addGear, addItem, emptyInventory } from "./inventory";
import {
  dialogueUnlockTags,
  effectiveStats,
  equippedMods,
  equippedWeaponProfile,
  grantedAbilityIds,
} from "./selectors";
import { fitMod, type Workbench } from "./workbench";

/**
 * The joins: what a fitted part does once it is on a weapon somebody is
 * carrying through the world — to the character's stats, to the fight's
 * numbers, to the previews that quote them, to the sprite, and across a
 * save.
 */

function armedCharacter(weaponId = "wpn-rail-spitter"): CharacterState {
  const base = fixtureCharacter();
  const character: CharacterState = {
    ...base,
    stats: { ...base.stats, reflexes: 8, body: 8 },
  };
  return equip(character, addGear(emptyInventory(), weaponId, {}), weaponId)
    .character;
}

function benchWith(character: CharacterState, ...modIds: string[]): Workbench {
  let inventory = emptyInventory();
  for (const id of modIds) inventory = addItem(inventory, id, 1);
  return { character, inventory, credits: 500 };
}

describe("a fitted part flows through the equipment selectors", () => {
  it("folds its stat mods in exactly like a coat's", () => {
    const knife = armedCharacter("wpn-shard-knife");
    const before = effectiveStats(knife);
    const after = fitMod(
      benchWith(knife, "mod-gyro-sleeve"),
      { where: "equipped" },
      0,
      "mod-gyro-sleeve",
    ).character;
    const stats = effectiveStats(after);
    expect(stats.reflexes).toBe(before.reflexes + 1);
    expect(stats.body).toBe(before.body - 1);
  });

  it("grants its ability, and takes it away again when pulled", () => {
    const pistol = armedCharacter();
    expect(grantedAbilityIds(pistol)).not.toContain("ability-burst-fire");
    const modded = fitMod(
      benchWith(pistol, "mod-burst-governor"),
      { where: "equipped" },
      1,
      "mod-burst-governor",
    ).character;
    expect(grantedAbilityIds(modded)).toContain("ability-burst-fire");
    expect(equippedMods(modded).map((m) => m.id)).toEqual([
      "mod-burst-governor",
    ]);
  });

  it("is not an equipped item — it is part of the weapon", () => {
    const pistol = armedCharacter();
    const modded = fitMod(
      benchWith(pistol, "mod-burst-governor"),
      { where: "equipped" },
      1,
      "mod-burst-governor",
    ).character;
    // Nothing that walks the slots should ever see a mod as a slot.
    expect(dialogueUnlockTags(modded)).toEqual(dialogueUnlockTags(pistol));
  });
});

describe("the fight reads the modded figures, not the item's", () => {
  function combatFor(character: CharacterState): GameState {
    const state = createNewGame({ seed: 7 });
    return { ...state, player: character };
  }

  const encounterId = encounters[0]?.id ?? "";

  it("snapshots the derived profile into the combatant", () => {
    const modded = fitMod(
      benchWith(armedCharacter(), "mod-splitbore-choke"),
      { where: "equipped" },
      0,
      "mod-splitbore-choke",
    ).character;
    const combat = createCombat(combatFor(modded), encounterId);
    const player = combat.combatants.find((c) => c.kind === "player");
    expect(player?.weapon).toEqual(equippedWeaponProfile(modded));
    expect(player?.weapon.damage).toBe(10);
    expect(player?.weapon.accuracy).toBe(-1);
  });

  it("lets a piercing round meet less plating", () => {
    const weapon = { name: "x", damage: 8, rangeType: "ranged" as const };
    const piercing = { ...weapon, armorPierce: 2 };
    expect(effectiveArmor(weapon, 3)).toBe(3);
    expect(effectiveArmor(piercing, 3)).toBe(1);
    expect(attackDamage(piercing, 4, 3)).toBe(
      attackDamage(weapon, 4, 3) + 2,
    );
    // It never hands the target armor back.
    expect(effectiveArmor(piercing, 1)).toBe(0);
  });

  it("lends reach without letting it fall below the tile in front", () => {
    const melee = { name: "x", damage: 4, rangeType: "melee" as const };
    expect(weaponReach(melee)).toBe(weaponRange("melee"));
    expect(weaponReach({ ...melee, rangeBonus: 2 })).toBe(3);
    expect(weaponReach({ ...melee, rangeBonus: -9 })).toBe(1);
  });

  it("spends accuracy as points of the attack roll", () => {
    const weapon = { name: "x", damage: 5, rangeType: "ranged" as const };
    expect(attackHitChance({ ...weapon, accuracy: 3 }, 5, 5)).toBeCloseTo(
      attackHitChance(weapon, 8, 5),
      10,
    );
  });
});

describe("previews quote the numbers the engine will resolve", () => {
  /**
   * The player, armed with whatever the item layer derived, facing one
   * plated body four tiles away. Hand-rolled (see ./combat/testSupport)
   * so the shot is in reach of a bare weapon and the figures move only
   * because the parts moved them.
   */
  function arena(character: CharacterState) {
    return makeCombat([
      makeCombatant({
        id: "player",
        kind: "player",
        stats: effectiveStats(character),
        weapon: equippedWeaponProfile(character) ?? {
          name: "Bare Hands",
          damage: 2,
          rangeType: "melee",
        },
        position: { x: 0, y: 0 },
      }),
      makeCombatant({
        id: "foe",
        armor: 3,
        stats: { body: 5, reflexes: 5, tech: 5, cool: 5, intelligence: 5 },
        position: { x: 4, y: 0 },
      }),
    ]);
  }

  it("quotes the modded reach, and lists exactly the legal options", () => {
    const bare = armedCharacter();
    const modded = fitMod(
      benchWith(bare, "mod-longspar-extension"),
      { where: "equipped" },
      0,
      "mod-longspar-extension",
    ).character;

    const combat = arena(modded);
    const preview = attackPreview(combat);
    expect(preview.range).toBe(weaponRange("ranged") + 2);
    // The preview is the legal query, sorted — one derivation, quoted
    // twice, so a tooltip can never promise a shot the engine refuses.
    expect([...preview.options]).toEqual([...attackOptions(combat)]);
  });

  it("moves the odds a sight buys into the preview's own figures", () => {
    const bare = armedCharacter();
    const sighted = fitMod(
      benchWith(bare, "mod-smartlink-sight"),
      { where: "equipped" },
      0,
      "mod-smartlink-sight",
    ).character;
    const before = attackPreview(arena(bare));
    const after = attackPreview(arena(sighted));
    expect(after.best!.hitChance).toBeGreaterThan(before.best!.hitChance);
    // And costs the damage the part says it costs.
    expect(after.best!.damage).toBe(before.best!.damage - 1);
  });

  it("shows plating giving way to a piercing part", () => {
    const bare = armedCharacter();
    const piercing = fitMod(
      benchWith(bare, "mod-lattice-rifling"),
      { where: "equipped" },
      0,
      "mod-lattice-rifling",
    ).character;
    const before = attackPreview(arena(bare));
    const after = attackPreview(arena(piercing));
    // Two points of the foe's three-point plate stop mattering.
    expect(after.best!.damage).toBe(before.best!.damage + 2);
  });
});

describe("a modded weapon looks modded", () => {
  it("repaints the weapon layer's accent channel", () => {
    const bare = armedCharacter();
    const modded = fitMod(
      benchWith(bare, "mod-smartlink-sight"),
      { where: "equipped" },
      0,
      "mod-smartlink-sight",
    ).character;
    const bareKey = composedCharacterKey(
      composeCharacter(bare.appearance, bare.equipment),
    );
    const moddedKey = composedCharacterKey(
      composeCharacter(modded.appearance, modded.equipment),
    );
    expect(moddedKey).not.toBe(bareKey);
  });
});

describe("parts survive a save", () => {
  it("round-trips through JSON on the weapon in hand and in the bag", () => {
    const held = fitMod(
      benchWith(armedCharacter(), "mod-lattice-rifling"),
      { where: "equipped" },
      0,
      "mod-lattice-rifling",
    ).character;
    const state: GameState = {
      ...createNewGame({ seed: 3 }),
      player: held,
      inventory: addGear(emptyInventory(), "wpn-torque-cleaver", { mods: [
        null,
        "mod-gyro-sleeve",
      ] }),
    };

    const storage = createMemoryStorage();
    saveGame(state, "slot1", storage, 1);
    const loaded = loadGame("slot1", storage);

    expect(loaded.player.equipment.weaponMods).toEqual([
      "mod-lattice-rifling",
      null,
    ]);
    expect(loaded.inventory.stacks[0]?.mods).toEqual([
      null,
      "mod-gyro-sleeve",
    ]);
    // And the figures come back with it.
    expect(equippedWeaponProfile(loaded.player)).toEqual(
      equippedWeaponProfile(held),
    );
  });

  it("stores an unmodded weapon exactly as it always did", () => {
    const state: GameState = {
      ...createNewGame({ seed: 3 }),
      inventory: addGear(emptyInventory(), "wpn-shard-knife", {}),
    };
    expect(JSON.parse(JSON.stringify(state.inventory))).toEqual({
      stacks: [{ itemId: "wpn-shard-knife", quantity: 1 }],
    });
  });
});

describe("saves written before weapons had sockets", () => {
  /** A v10 save: no weaponMods anywhere, because they did not exist. */
  function preModSave(): GameState {
    const state = createNewGame({ seed: 5 });
    const player = equip(
      state.player,
      addGear(emptyInventory(), "wpn-shard-knife", {}),
      "wpn-shard-knife",
    );
    return {
      ...state,
      player: player.character,
      inventory: addItem(player.inventory, "con-trauma-patch", 2),
      version: 10,
    };
  }

  it("load with every socket empty and nothing else changed", () => {
    const old = preModSave();
    const migrated = migrateGameState(old, 10);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    expect(migrated.player.equipment.weaponMods).toBeUndefined();
    expect(migrated.inventory).toEqual(old.inventory);
    expect(equippedWeaponProfile(migrated.player)).toEqual({
      name: "Shard Knife",
      damage: 4,
      rangeType: "melee",
    });
  });

  it("go through the save system end to end", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot2",
      JSON.stringify({ version: 10, savedAt: 1, state: preModSave() }),
    );
    const loaded = loadGame("slot2", storage);
    expect(loaded.version).toBe(GAME_STATE_VERSION);
    expect(loaded.player.equipment.weapon).toBe("wpn-shard-knife");
  });

  it("lose a part whose socket the content no longer offers", () => {
    const base = createNewGame({ seed: 9 });
    // A save written when the knife took a barrel part; it takes a grip.
    const stale: GameState = {
      ...base,
      player: {
        ...base.player,
        equipment: {
          ...base.player.equipment,
          weapon: "wpn-shard-knife",
          weaponMods: ["mod-lattice-rifling"],
        },
      },
      version: 10,
    };
    const migrated = migrateGameState(stale, 10);
    expect(migrated.player.equipment.weaponMods).toBeUndefined();
  });
});
