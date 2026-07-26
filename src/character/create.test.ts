import { describe, expect, it } from "vitest";
import { getBackground } from "../data/backgrounds";
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
    });
    expect(character).toEqual({
      name: "Vex",
      backgroundId: "gutter-courier",
      stats: { body: 7, reflexes: 7, tech: 6, cool: 6, intelligence: 6 },
      derived: deriveAttributes(character.stats),
      hp: character.derived.maxHp,
      neuralLoad: 0,
      tags: ["street", "courier"],
    });
  });

  it("applies each background's stat bonuses", () => {
    const diver = getBackground("grid-diver")!;
    const character = createCharacter({
      name: "Nyx",
      background: diver,
      allocation: defaultAllocation(),
    });
    expect(character.stats.tech).toBe(8);
    expect(character.stats.body).toBe(6);
  });

  it("starts hp at max HP for the boosted stat line", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
    });
    expect(character.hp).toBe(maxHp(character.stats));
  });

  it("copies background tags instead of aliasing the data", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
    });
    character.tags.push("mutated");
    expect(courier.tags).toEqual(["street", "courier"]);
  });

  it("rejects an invalid allocation with the validation errors", () => {
    const overspent: Stats = { ...defaultAllocation(), body: 10 };
    expect(() =>
      createCharacter({ name: "Vex", background: courier, allocation: overspent }),
    ).toThrowError(CharacterCreationError);
    try {
      createCharacter({ name: "Vex", background: courier, allocation: overspent });
    } catch (error) {
      expect((error as CharacterCreationError).errors).toContainEqual({
        code: "overspent",
      });
    }
  });

  it("survives a JSON round-trip unchanged", () => {
    const character = createCharacter({
      name: "Vex",
      background: courier,
      allocation: defaultAllocation(),
    });
    expect(JSON.parse(JSON.stringify(character))).toEqual(character);
  });
});
