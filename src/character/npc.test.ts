import { describe, expect, it } from "vitest";
import { seededAppearance, validateAppearance } from "./appearance";
import { interactableVisual, npcSeed } from "./npc";

describe("npcSeed", () => {
  it("is stable for a given map position", () => {
    expect(npcSeed("cinder-plaza", 3, 7)).toBe(npcSeed("cinder-plaza", 3, 7));
  });

  it("differs across positions and maps", () => {
    const seeds = new Set([
      npcSeed("cinder-plaza", 3, 7),
      npcSeed("cinder-plaza", 7, 3),
      npcSeed("cinder-plaza", 3, 8),
      npcSeed("greywater-steps", 3, 7),
    ]);
    expect(seeds.size).toBe(4);
  });
});

describe("interactableVisual", () => {
  const authored = {
    appearance: seededAppearance(1),
    outfit: "out-spire-suit",
  };

  it("returns the authored visual untouched when present", () => {
    expect(
      interactableVisual("cinder-plaza", { x: 2, y: 2, visual: authored }),
    ).toBe(authored);
  });

  it("falls back to a stable, valid seeded look per map position", () => {
    const first = interactableVisual("cinder-plaza", { x: 4, y: 9 });
    const again = interactableVisual("cinder-plaza", { x: 4, y: 9 });
    expect(again).toEqual(first);
    expect(validateAppearance(first.appearance)).toEqual([]);
    // Seeded ambients carry no gear — appearance only.
    expect(first.weapon).toBeUndefined();
    expect(first.outfit).toBeUndefined();

    const elsewhere = interactableVisual("cinder-plaza", { x: 5, y: 9 });
    expect(elsewhere.appearance).not.toEqual(first.appearance);
  });
});
