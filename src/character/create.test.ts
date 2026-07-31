import { describe, expect, it } from "vitest";
import { getBackground } from "../data/backgrounds";
import {
  AppearanceValidationError,
  defaultAppearance,
  randomAppearance,
} from "./appearance";
import { createRng } from "../state/rng";
import {
  CharacterCreationError,
  createCharacter,
  defaultAllocation,
} from "./create";
import { deriveAttributes, maxHp } from "./derived";
import { validateAllocation, type Stats } from "./stats";

const courier = getBackground("gutter-courier")!;

describe("defaultAllocation", () => {
  it("is a valid point-buy spread", () => {
    expect(validateAllocation(defaultAllocation()).valid).toBe(true);
  });
});

describe("createCharacter", () => {
  it("produces a fully shaped character", () => {
    const character = createCharacter({
      name: "  Vex  ",
      background: courier,
      allocation: defaultAllocation(),
      appearance: defaultAppearance(),
    });
    expect(character).toEqual({
      name: "Vex",
      backgroundId: "gutter-courier",
      stats: { body: 7, reflexes: 7, tech: 6, cool: 6, intelligence: 6 },
      derived: deriveAttributes(character.stats),
      hp: character.derived.maxHp,
      neuralLoad: 0,
      equipment: { weapon: null, outfit: null, enhancements: {} },
      appearance: defaultAppearance(),
      tags: ["street", "courier"],
      advancement: { pointsSpent: 0, abilityIds: [], perkIds: [] },
    });
  });

  it("applies each background's stat bonuses", () => {
    const diver = getBackground("grid-diver")!;
    const character = createCharacter({
      name: "Nyx",
      background: diver,
      allocation: defaultAllocation(),
      appearance: defaultAppearance(),
    });
    expect(character.stats.tech).toBe(8);
    expect(character.stats.body).toBe(6);
  });

  it("starts hp at max HP for the boosted stat line", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
      appearance: defaultAppearance(),
    });
    expect(character.hp).toBe(maxHp(character.stats));
  });

  it("copies background tags instead of aliasing the data", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
      appearance: defaultAppearance(),
    });
    character.tags.push("mutated");
    expect(courier.tags).toEqual(["street", "courier"]);
  });

  it("rejects an invalid allocation with the validation errors", () => {
    const overspent: Stats = { ...defaultAllocation(), body: 10 };
    expect(() =>
      createCharacter({
        name: "Vex",
        background: courier,
        allocation: overspent,
        appearance: defaultAppearance(),
      }),
    ).toThrowError(CharacterCreationError);
    try {
      createCharacter({
        name: "Vex",
        background: courier,
        allocation: overspent,
        appearance: defaultAppearance(),
      });
    } catch (error) {
      expect((error as CharacterCreationError).errors).toContainEqual({
        code: "overspent",
      });
    }
  });

  it("rejects an appearance referencing unknown catalog ids", () => {
    const broken = { ...defaultAppearance(), hairStyle: "bogus" };
    expect(() =>
      createCharacter({
        name: "Vex",
        background: courier,
        allocation: defaultAllocation(),
        appearance: broken,
      }),
    ).toThrowError(AppearanceValidationError);
  });

  it("copies the appearance instead of aliasing the input", () => {
    const appearance = defaultAppearance();
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
      appearance,
    });
    appearance.hairColor = "silver";
    expect(character.appearance.hairColor).toBe("raven");
  });

  it("keeps a provided appearance verbatim", () => {
    const { value: appearance } = randomAppearance(createRng(7));
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
      appearance,
    });
    expect(character.appearance).toEqual(appearance);
  });

  it("survives a JSON round-trip unchanged", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
      appearance: defaultAppearance(),
    });
    expect(JSON.parse(JSON.stringify(character))).toEqual(character);
  });
});
