import { describe, expect, it } from "vitest";
import { UNINSTALL_TRAUMA_PER_LOAD } from "../inventory/equipment";
import type { EnhancementItem, Item } from "../inventory/items";
import { SaveError } from "../state/save";
import {
  characterNameError,
  formatBonuses,
  formatTimestamp,
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
