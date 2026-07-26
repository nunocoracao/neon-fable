import { describe, expect, it } from "vitest";
import { createCharacter, defaultAllocation } from "../character";
import { STAT_HARD_CAP } from "../character/stats";
import { getBackground } from "../data/backgrounds";
import { equip, installEnhancement } from "./equipment";
import { addItem, emptyInventory } from "./inventory";
import type { Item, ItemResolver } from "./items";
import {
  armorValue,
  dialogueUnlockTags,
  effectiveStats,
  grantedAbilityIds,
} from "./selectors";

function makeCharacter() {
  return createCharacter({
    name: "Vex",
    background: getBackground("gutter-courier")!,
    allocation: defaultAllocation(),
  });
}

describe("effectiveStats", () => {
  it("returns base stats for an unequipped character", () => {
    const character = makeCharacter();
    expect(effectiveStats(character)).toEqual(character.stats);
  });

  it("folds weapon, outfit, and enhancement stat mods over base stats", () => {
    let inv = addItem(emptyInventory(), "wpn-shard-knife"); // +1 reflexes
    inv = addItem(inv, "out-courier-slicker"); // +1 reflexes
    inv = addItem(inv, "cyb-optic-suite"); // +1 reflexes, -1 cool
    let loadout = equip(makeCharacter(), inv, "wpn-shard-knife");
    loadout = equip(loadout.character, loadout.inventory, "out-courier-slicker");
    loadout = installEnhancement(
      loadout.character,
      loadout.inventory,
      "cyb-optic-suite",
    );
    // Gutter courier base: body 7, reflexes 7, tech 6, cool 6, intelligence 6.
    expect(effectiveStats(loadout.character)).toEqual({
      body: 7,
      reflexes: 10,
      tech: 6,
      cool: 5,
      intelligence: 6,
    });
  });

  it("does not mutate the character's base stats", () => {
    const inv = addItem(emptyInventory(), "wpn-shard-knife");
    const { character } = equip(makeCharacter(), inv, "wpn-shard-knife");
    effectiveStats(character);
    expect(character.stats.reflexes).toBe(7);
  });

  it("clamps folded stats to [1, STAT_HARD_CAP]", () => {
    const fixtures: Item[] = [
      {
        id: "fix-exo",
        kind: "outfit",
        name: "Exo Rig",
        description: "test",
        armor: 0,
        effects: [
          { type: "stat-mod", stat: "body", amount: 99 },
          { type: "stat-mod", stat: "cool", amount: -99 },
        ],
      },
    ];
    const resolve: ItemResolver = (id) => fixtures.find((i) => i.id === id)!;
    const character = makeCharacter();
    const inv = addItem(emptyInventory(), "fix-exo", 1, resolve);
    const loadout = equip(character, inv, "fix-exo", resolve);
    const stats = effectiveStats(loadout.character, resolve);
    expect(stats.body).toBe(STAT_HARD_CAP);
    expect(stats.cool).toBe(1);
  });
});

describe("grantedAbilityIds", () => {
  it("collects ability grants from gear and installed chrome", () => {
    let inv = addItem(emptyInventory(), "wpn-stun-baton");
    inv = addItem(inv, "cyb-myomer-arms");
    let loadout = equip(makeCharacter(), inv, "wpn-stun-baton");
    loadout = installEnhancement(
      loadout.character,
      loadout.inventory,
      "cyb-myomer-arms",
    );
    expect(grantedAbilityIds(loadout.character)).toEqual([
      "ability-stun-strike",
      "ability-crush",
    ]);
  });

  it("is empty with nothing equipped", () => {
    expect(grantedAbilityIds(makeCharacter())).toEqual([]);
  });
});

describe("dialogueUnlockTags", () => {
  it("collects dialogue unlocks from equipped items", () => {
    const inv = addItem(emptyInventory(), "out-spire-suit");
    const { character } = equip(makeCharacter(), inv, "out-spire-suit");
    expect(dialogueUnlockTags(character)).toEqual(["corp-formal"]);
  });
});

describe("armorValue", () => {
  it("reads armor from the equipped outfit, defaulting to 0", () => {
    const character = makeCharacter();
    expect(armorValue(character)).toBe(0);
    const inv = addItem(emptyInventory(), "out-courier-slicker");
    const equipped = equip(character, inv, "out-courier-slicker");
    expect(armorValue(equipped.character)).toBe(2);
  });
});
