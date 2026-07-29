import { describe, expect, it } from "vitest";
import { UNINSTALL_TRAUMA_PER_LOAD } from "../inventory/equipment";
import type { EnhancementItem, Item } from "../inventory/items";
import { SaveError } from "../state/save";
import type { CombatEvent } from "../combat/types";
import {
  characterNameError,
  combatEventText,
  exitLabel,
  combatantDisplayNames,
  formatBonuses,
  formatTimestamp,
  percentLabel,
  pointsLabel,
  itemEffectLabels,
  itemSummary,
  pointBuyErrorMessage,
  requirementLabel,
  requirementLabels,
  saveErrorMessage,
  signedNumber,
  slotDisplayName,
  statLabel,
  uninstallWarning,
} from "./format";

const knife: Item = {
  id: "knife",
  kind: "weapon",
  name: "Knife",
  description: "",
  damage: 4,
  rangeType: "melee",
  effects: [{ type: "stat-mod", stat: "reflexes", amount: 1 }],
};

const pistol: Item = {
  id: "pistol",
  kind: "weapon",
  name: "Pistol",
  description: "",
  damage: 5,
  rangeType: "ranged",
  requirement: { stat: "reflexes", value: 5 },
  effects: [],
};

const optic: EnhancementItem = {
  id: "optic",
  kind: "enhancement",
  name: "Optic Suite",
  description: "",
  slot: "eyes",
  neuralCost: 2,
  effects: [
    { type: "stat-mod", stat: "cool", amount: -1 },
    { type: "grant-ability", abilityId: "ability-x" },
    { type: "unlock-dialogue", tag: "optic-scan" },
  ],
};

const lookup = (id: string): Item | undefined =>
  [knife, pistol, optic].find((item) => item.id === id);

describe("requirementLabel", () => {
  it("formats stat requirements like '[Tech 6]'", () => {
    expect(requirementLabel({ type: "stat", stat: "tech", value: 6 })).toBe(
      "[Tech 6]",
    );
  });

  it("formats background requirements", () => {
    expect(requirementLabel({ type: "background", tag: "corp" })).toBe(
      "[Background: corp]",
    );
  });

  it("formats item requirements with resolved names and quantities", () => {
    expect(
      requirementLabel({ type: "item", itemId: "knife" }, lookup),
    ).toBe("[Requires: Knife]");
    expect(
      requirementLabel({ type: "item", itemId: "knife", quantity: 2 }, lookup),
    ).toBe("[Requires: 2× Knife]");
  });

  it("falls back to the raw id for unknown items", () => {
    expect(
      requirementLabel({ type: "item", itemId: "mystery" }, lookup),
    ).toBe("[Requires: mystery]");
  });

  it("formats enhancement requirements", () => {
    expect(
      requirementLabel({ type: "enhancement", itemId: "optic" }, lookup),
    ).toBe("[Installed: Optic Suite]");
  });

  it("formats credits requirements", () => {
    expect(requirementLabel({ type: "credits", value: 150 })).toBe("[150 cr]");
  });

  it("formats flag requirements", () => {
    expect(
      requirementLabel({ type: "flag-equals", key: "door-entry", value: "corp" }),
    ).toBe("[door-entry: corp]");
    expect(
      requirementLabel({ type: "flag-at-least", key: "rep", value: 3 }),
    ).toBe("[rep 3+]");
  });

  it("joins multiple requirements with spaces", () => {
    expect(
      requirementLabels(
        [
          { type: "stat", stat: "cool", value: 8 },
          { type: "background", tag: "street" },
        ],
        lookup,
      ),
    ).toBe("[Cool 8] [Background: street]");
    expect(requirementLabels(undefined)).toBe("");
  });
});

describe("pointBuyErrorMessage", () => {
  it("names the stat for out-of-range errors", () => {
    expect(
      pointBuyErrorMessage({ code: "out-of-range", stat: "body" }),
    ).toMatch(/Body.*3.*10/);
  });

  it("covers pool-level errors", () => {
    expect(pointBuyErrorMessage({ code: "overspent" })).toMatch(/more points/);
    expect(pointBuyErrorMessage({ code: "underspent" })).toMatch(/remaining/);
  });
});

describe("item formatting", () => {
  it("summarizes each item kind", () => {
    expect(itemSummary(knife)).toBe("Melee weapon · 4 dmg");
    expect(itemSummary(pistol)).toBe("Ranged weapon · 5 dmg · needs Reflexes 5");
    expect(itemSummary(optic)).toBe("Cyberware · Eyes · 2 neural load");
    expect(
      itemSummary({
        id: "patch",
        kind: "consumable",
        name: "Patch",
        description: "",
        effect: { type: "heal", amount: 10 },
      }),
    ).toBe("Consumable · heals 10 HP");
    expect(
      itemSummary({
        id: "stim",
        kind: "consumable",
        name: "Stim",
        description: "",
        effect: { type: "combat-boost", stat: "reflexes", amount: 2, turns: 3 },
      }),
    ).toBe("Consumable · +2 Reflexes for 3 turns (combat only)");
    expect(
      itemSummary({ id: "m", kind: "misc", name: "M", description: "", tags: [] }),
    ).toBe("Item");
  });

  it("labels gear effects, resolving ability names when known", () => {
    expect(
      itemEffectLabels(optic, (id) =>
        id === "ability-x"
          ? {
              id,
              name: "Crush",
              description: "",
              range: 1,
              cooldown: 1,
              effect: { type: "damage", amount: 1 },
            }
          : undefined,
      ),
    ).toEqual(["-1 Cool", "Grants Crush", 'Unlocks "optic-scan" dialogue']);
    expect(itemEffectLabels(optic, () => undefined)[1]).toBe("Grants ability-x");
  });

  it("warns about extraction trauma from the item's neural cost", () => {
    expect(uninstallWarning(optic)).toBe(
      `Extraction destroys the Optic Suite and deals ${2 * UNINSTALL_TRAUMA_PER_LOAD} HP of trauma.`,
    );
  });
});

describe("misc labels", () => {
  it("capitalizes stat names and signs numbers", () => {
    expect(statLabel("intelligence")).toBe("Intelligence");
    expect(signedNumber(2)).toBe("+2");
    expect(signedNumber(-1)).toBe("-1");
    expect(signedNumber(0)).toBe("0");
  });

  it("formats stat bonuses in stat order", () => {
    expect(formatBonuses({ reflexes: 1, body: 1 })).toBe("+1 Body, +1 Reflexes");
    expect(formatBonuses({})).toBe("");
  });

  it("validates character names", () => {
    expect(characterNameError("")).toBe("Enter a name");
    expect(characterNameError("   ")).toBe("Enter a name");
    expect(characterNameError("a".repeat(25))).toMatch(/24/);
    expect(characterNameError("Vex")).toBeNull();
  });

  it("names a way out by what it is and where it goes", () => {
    expect(exitLabel("Chainwell Stair", "Cinder Row Plaza")).toBe(
      "Chainwell Stair → Cinder Row Plaza",
    );
    // A destination the shell could not resolve is dropped rather than
    // shown to the player as a raw content id.
    expect(exitLabel("Tram Gate")).toBe("Tram Gate");
    expect(exitLabel("Tram Gate", "")).toBe("Tram Gate");
  });

  it("names save slots", () => {
    expect(slotDisplayName("slot1")).toBe("Slot 1");
    expect(slotDisplayName("autosave")).toBe("Autosave");
  });

  it("translates save errors to friendly messages", () => {
    expect(saveErrorMessage(new SaveError("missing", "slot1", ""))).toMatch(
      /empty/,
    );
    expect(saveErrorMessage(new SaveError("corrupt", "slot1", ""))).toMatch(
      /corrupted/,
    );
    expect(
      saveErrorMessage(new SaveError("version-mismatch", "slot1", "")),
    ).toMatch(/version/);
  });

  it("formats timestamps as YYYY-MM-DD HH:MM", () => {
    expect(formatTimestamp(Date.UTC(2026, 0, 5, 12, 30))).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    );
  });
});

describe("combat log formatting", () => {
  const names: Record<string, string> = {
    player: "Vex",
    "nme-static-drone-1": "Static Drone",
  };
  const nameOf = (id: string) => names[id] ?? id;
  const line = (event: CombatEvent) => combatEventText(event, nameOf);

  it("renders percentages from chances", () => {
    expect(percentLabel(0.649)).toBe("65%");
    expect(percentLabel(0.05)).toBe("5%");
  });

  it("pluralizes advancement points", () => {
    expect(pointsLabel(1)).toBe("1 point");
    expect(pointsLabel(0)).toBe("0 points");
    expect(pointsLabel(3)).toBe("3 points");
  });

  it("describes attacks, hits, and misses", () => {
    expect(
      line({
        type: "attacked",
        attackerId: "player",
        targetId: "nme-static-drone-1",
        hit: true,
        damage: 5,
      }),
    ).toBe("Vex hits Static Drone for 5 damage.");
    expect(
      line({
        type: "attacked",
        attackerId: "nme-static-drone-1",
        targetId: "player",
        hit: false,
        damage: 0,
      }),
    ).toBe("Static Drone misses Vex.");
  });

  it("describes abilities by name, including self-casts and stuns", () => {
    expect(
      line({
        type: "ability-used",
        combatantId: "player",
        abilityId: "ability-stun-strike",
        targetId: "nme-static-drone-1",
        damage: 2,
        stunTurns: 1,
      }),
    ).toBe("Vex hits Static Drone with Stun Strike for 2 damage, stunning them.");
    expect(
      line({
        type: "ability-used",
        combatantId: "player",
        abilityId: "ability-combat-focus",
        targetId: "player",
        damage: 0,
        stunTurns: 0,
      }),
    ).toBe("Vex uses Combat Focus.");
  });

  it("describes items, healing, and boosts", () => {
    expect(
      line({ type: "item-used", combatantId: "player", itemId: "con-trauma-patch" }),
    ).toBe("Vex uses a Trauma Patch.");
    expect(line({ type: "healed", combatantId: "player", amount: 7 })).toBe(
      "Vex recovers 7 HP.",
    );
    expect(
      line({
        type: "boosted",
        combatantId: "player",
        stat: "reflexes",
        amount: 2,
        turns: 3,
      }),
    ).toBe("Vex gains +2 Reflexes for 3 turns.");
  });

  it("describes rounds, stuns, flee attempts, and endings", () => {
    expect(line({ type: "round-started", round: 3 })).toBe("— Round 3 —");
    expect(
      line({ type: "stun-skipped", combatantId: "nme-static-drone-1" }),
    ).toMatch(/stunned/);
    expect(
      line({ type: "flee-attempted", combatantId: "player", success: false }),
    ).toMatch(/no opening/);
    expect(
      line({ type: "flee-attempted", combatantId: "player", success: true }),
    ).toMatch(/breaks away/);
    expect(line({ type: "defeated", combatantId: "nme-static-drone-1" })).toBe(
      "Static Drone goes down.",
    );
    expect(line({ type: "combat-ended", result: "victory" })).toMatch(/down/);
    expect(line({ type: "combat-ended", result: "defeat" })).toMatch(/collapse/);
    expect(line({ type: "combat-ended", result: "fled" })).toMatch(/clear/);
  });

  it("suppresses turn markers and moves — the scene conveys those", () => {
    expect(line({ type: "turn-started", combatantId: "player" })).toBeNull();
    expect(
      line({
        type: "moved",
        combatantId: "player",
        from: { x: 0, y: 0 },
        to: { x: 1, y: 0 },
      }),
    ).toBeNull();
  });
});

describe("combatantDisplayNames", () => {
  it("numbers duplicates and leaves unique names alone", () => {
    expect(
      combatantDisplayNames([
        { id: "player", name: "Vex" },
        { id: "nme-rustyard-bruiser-1", name: "Rustyard Bruiser" },
        { id: "nme-rustyard-bruiser-2", name: "Rustyard Bruiser" },
      ]),
    ).toEqual({
      player: "Vex",
      "nme-rustyard-bruiser-1": "Rustyard Bruiser 1",
      "nme-rustyard-bruiser-2": "Rustyard Bruiser 2",
    });
  });
});
