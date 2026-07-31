import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { STATIC_BANDS_TABLE } from "../data/static";
import { installEnhancement, uninstallEnhancement } from "./equipment";
import { addItem, emptyInventory } from "./inventory";
import type { CharacterState } from "../character/create";
import type { Item, ItemResolver } from "./items";
import { effectiveStats } from "./selectors";
import {
  dialogueStats,
  isDampener,
  meetsStaticBand,
  previewInstall,
  previewUninstall,
  readStatic,
  staticEffects,
  staticLevel,
  staticLoadOf,
  staticReading,
  totalStatic,
} from "./staticLoad";

/**
 * Fixture implants, so the banding tests are about arithmetic rather
 * than about what the shipped catalog happens to charge today. The
 * shipped loads are pinned in src/data/static.test.ts instead.
 */
const fixtures: Item[] = [
  {
    id: "fix-loud-eyes",
    kind: "enhancement",
    name: "Loud Eyes",
    description: "test",
    slot: "eyes",
    neuralCost: 1,
    staticLoad: 4,
    effects: [],
  },
  {
    id: "fix-loud-arms",
    kind: "enhancement",
    name: "Loud Arms",
    description: "test",
    slot: "arms",
    neuralCost: 1,
    staticLoad: 4,
    effects: [],
  },
  {
    id: "fix-quiet-neural",
    kind: "enhancement",
    name: "Quiet Lattice",
    description: "test",
    slot: "neural",
    neuralCost: 1,
    staticLoad: -3,
    effects: [],
  },
  {
    id: "fix-coat",
    kind: "outfit",
    name: "Coat",
    description: "test",
    armor: 1,
    effects: [],
  },
];

const resolve: ItemResolver = (id) => {
  const found = fixtures.find((item) => item.id === id);
  if (!found) throw new Error(`unknown fixture item "${id}"`);
  return found;
};

/** A character with the named fixture implants installed. */
function wearing(...itemIds: string[]): CharacterState {
  let character = fixtureCharacter();
  let inventory = emptyInventory();
  for (const id of itemIds) {
    inventory = addItem(inventory, id, 1, resolve);
    const loadout = installEnhancement(character, inventory, id, resolve);
    character = loadout.character;
    inventory = loadout.inventory;
  }
  return character;
}

describe("staticLoadOf", () => {
  it("reads an implant's load and nothing else's", () => {
    expect(staticLoadOf(resolve("fix-loud-eyes"))).toBe(4);
    expect(staticLoadOf(resolve("fix-quiet-neural"))).toBe(-3);
    expect(staticLoadOf(resolve("fix-coat"))).toBe(0);
  });

  it("calls an implant a dampener exactly when it quiets things", () => {
    expect(isDampener(resolve("fix-quiet-neural"))).toBe(true);
    expect(isDampener(resolve("fix-loud-eyes"))).toBe(false);
    expect(isDampener(resolve("fix-coat"))).toBe(false);
  });
});

describe("banding", () => {
  it("names the last band whose floor the level clears", () => {
    for (const band of STATIC_BANDS_TABLE) {
      expect(readStatic(band.min).band).toBe(band.id);
    }
    // One under a floor is still the band below it.
    for (let i = 1; i < STATIC_BANDS_TABLE.length; i++) {
      const floor = STATIC_BANDS_TABLE[i]!.min;
      expect(readStatic(floor - 1).band).toBe(STATIC_BANDS_TABLE[i - 1]!.id);
    }
  });

  it("bands levels no loadout can reach rather than throwing", () => {
    expect(readStatic(0).band).toBe("clear");
    expect(readStatic(999).band).toBe("screaming");
    // Negative can only arrive from a caller doing its own arithmetic;
    // it still reads as a band, and it reads as the quiet one.
    expect(readStatic(-5).band).toBe("clear");
  });

  it("carries the band's own effects on the reading", () => {
    const reading = readStatic(STATIC_BANDS_TABLE[0]!.min);
    expect(reading.def.effects.coolPenalty).toBe(0);
  });
});

describe("staticLevel", () => {
  it("is zero with nothing installed", () => {
    expect(staticLevel(fixtureCharacter(), resolve)).toBe(0);
    expect(staticReading(fixtureCharacter(), resolve).band).toBe("clear");
  });

  it("sums the loads of everything installed", () => {
    expect(staticLevel(wearing("fix-loud-eyes"), resolve)).toBe(4);
    expect(staticLevel(wearing("fix-loud-eyes", "fix-loud-arms"), resolve)).toBe(
      8,
    );
  });

  it("subtracts a dampener from the total", () => {
    const noisy = wearing("fix-loud-eyes", "fix-loud-arms");
    const damped = wearing("fix-loud-eyes", "fix-loud-arms", "fix-quiet-neural");
    expect(staticLevel(noisy, resolve)).toBe(8);
    expect(staticLevel(damped, resolve)).toBe(5);
    expect(staticReading(noisy, resolve).band).toBe("screaming");
    expect(staticReading(damped, resolve).band).toBe("loud");
  });

  it("floors at zero, so dampeners alone are quiet and not quieter", () => {
    expect(staticLevel(wearing("fix-quiet-neural"), resolve)).toBe(0);
    expect(totalStatic([-3, -3])).toBe(0);
    expect(totalStatic([])).toBe(0);
  });

  it("falls back to arithmetic when an implant comes out", () => {
    const damped = wearing("fix-loud-eyes", "fix-loud-arms", "fix-quiet-neural");
    const pulled = uninstallEnhancement(
      damped,
      emptyInventory(),
      "neural",
      resolve,
    );
    expect(staticLevel(pulled.character, resolve)).toBe(8);
  });
});

describe("meetsStaticBand", () => {
  it("compares rungs, both ways round", () => {
    expect(meetsStaticBand("loud", "humming")).toBe(true);
    expect(meetsStaticBand("loud", "loud")).toBe(true);
    expect(meetsStaticBand("loud", "screaming")).toBe(false);
    expect(meetsStaticBand("loud", "loud", "at-most")).toBe(true);
    expect(meetsStaticBand("loud", "humming", "at-most")).toBe(false);
    expect(meetsStaticBand("clear", "humming", "at-most")).toBe(true);
  });
});

describe("previews", () => {
  it("projects the level and band an install would land in", () => {
    const character = wearing("fix-loud-eyes");
    const shift = previewInstall(character, "fix-loud-arms", resolve);
    expect(shift.from.level).toBe(4);
    expect(shift.to.level).toBe(8);
    expect(shift.delta).toBe(4);
    expect(shift.to.band).toBe("screaming");
    expect(shift.bandChanges).toBe(true);
  });

  it("projects a dampener as the quieting it is", () => {
    const character = wearing("fix-loud-eyes", "fix-loud-arms");
    const shift = previewInstall(character, "fix-quiet-neural", resolve);
    expect(shift.delta).toBe(-3);
    expect(shift.to.level).toBe(5);
    expect(shift.to.band).toBe("loud");
  });

  it("projects nothing for something that is not an implant", () => {
    const shift = previewInstall(wearing("fix-loud-eyes"), "fix-coat", resolve);
    expect(shift.delta).toBe(0);
    expect(shift.bandChanges).toBe(false);
  });

  it("matches what installing actually does — preview parity", () => {
    const before = wearing("fix-loud-eyes");
    const projected = previewInstall(before, "fix-loud-arms", resolve);
    const inventory = addItem(emptyInventory(), "fix-loud-arms", 1, resolve);
    const after = installEnhancement(before, inventory, "fix-loud-arms", resolve);
    expect(staticLevel(after.character, resolve)).toBe(projected.to.level);
    expect(staticReading(after.character, resolve).band).toBe(projected.to.band);
  });

  it("matches what an extraction actually does, and shifts nothing for an empty slot", () => {
    const before = wearing("fix-loud-eyes", "fix-loud-arms");
    const projected = previewUninstall(before, "arms", resolve);
    const after = uninstallEnhancement(before, emptyInventory(), "arms", resolve);
    expect(staticLevel(after.character, resolve)).toBe(projected.to.level);
    expect(projected.delta).toBe(-4);

    const empty = previewUninstall(before, "neural", resolve);
    expect(empty.delta).toBe(0);
    expect(empty.to.band).toBe(empty.from.band);
  });

  it("does its arithmetic under the floor, not on top of it", () => {
    // Nothing but a dampener: the meter reads 0 while the sum is -3.
    // A preview that started from the displayed 0 would report pulling
    // the collar as a *rise* to 3, which is the opposite of true.
    const quiet = wearing("fix-quiet-neural");
    expect(staticLevel(quiet, resolve)).toBe(0);

    const pulled = previewUninstall(quiet, "neural", resolve);
    expect(pulled.to.level).toBe(0);
    expect(pulled.delta).toBe(0);
    expect(
      staticLevel(
        uninstallEnhancement(quiet, emptyInventory(), "neural", resolve)
          .character,
        resolve,
      ),
    ).toBe(0);

    // And the same on the way in: a second dampener changes nothing a
    // player can see, and says so.
    const deeper = previewInstall(quiet, "fix-quiet-neural", resolve);
    expect(deeper.to.level).toBe(0);
    expect(deeper.delta).toBe(0);
  });
});

describe("dialogueStats", () => {
  it("leaves a quiet loadout exactly as the fight reads it", () => {
    const character = wearing("fix-loud-eyes");
    expect(staticEffects(character, resolve).coolPenalty).toBe(0);
    expect(dialogueStats(character, resolve)).toEqual(
      effectiveStats(character, resolve),
    );
  });

  it("takes the band's penalty off Cool, and off nothing else", () => {
    const character = wearing("fix-loud-eyes", "fix-loud-arms");
    const penalty = staticEffects(character, resolve).coolPenalty;
    expect(penalty).toBeGreaterThan(0);
    const combat = effectiveStats(character, resolve);
    const talking = dialogueStats(character, resolve);
    expect(talking.cool).toBe(combat.cool - penalty);
    expect({ ...talking, cool: 0 }).toEqual({ ...combat, cool: 0 });
  });

  it("never erases a person: Cool floors at 1", () => {
    const quiet = fixtureCharacter();
    const character = {
      ...wearing("fix-loud-eyes", "fix-loud-arms"),
      stats: { ...quiet.stats, cool: 1 },
    };
    expect(dialogueStats(character, resolve).cool).toBe(1);
  });
});
