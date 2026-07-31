import { describe, expect, it } from "vitest";
import { validateAppearance, visualEquipment } from "../character";
import { STAT_KEYS } from "../character/stats";
import { getAbility } from "./abilities";
import { cast } from "./cast";
import {
  CompanionError,
  companionLook,
  companionSpriteId,
  companions,
  getCompanion,
  parseCompanionSpriteId,
  requireCompanion,
} from "./companions";
import { getItem } from "./items";
import { maps } from "./maps";

/**
 * Companion content: every id a companion names must resolve, every
 * look must compose, and the person who walks behind you must be the
 * person who talks to you and the person standing on the map.
 */

describe("companion content", () => {
  it("has unique ids and at least one companion to recruit", () => {
    const ids = companions.map((c) => c.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(companions.map((c) => [c.id, c] as const))(
    "%s is a whole character",
    (_id, companion) => {
      expect(companion.name.length).toBeGreaterThan(0);
      expect(companion.blurb.length).toBeGreaterThan(0);
      expect(companion.maxHp).toBeGreaterThan(0);
      for (const stat of STAT_KEYS) {
        expect(companion.stats[stat], stat).toBeGreaterThanOrEqual(1);
      }
      for (const id of companion.abilityIds) {
        expect(getAbility(id), `ability ${id}`).toBeDefined();
      }
      if (companion.weaponId !== null) {
        expect(getItem(companion.weaponId)?.kind, companion.weaponId).toBe(
          "weapon",
        );
      }
      if (companion.outfitId !== null) {
        expect(getItem(companion.outfitId)?.kind, companion.outfitId).toBe(
          "outfit",
        );
      }
    },
  );

  it.each(companions.map((c) => [c.id, c] as const))(
    "%s has authored looks that compose, one of them the default",
    (_id, companion) => {
      expect(companion.looks.length).toBeGreaterThanOrEqual(1);
      const lookIds = companion.looks.map((l) => l.id);
      expect(new Set(lookIds).size).toBe(lookIds.length);
      expect(lookIds).toContain(companion.defaultLookId);
      for (const look of companion.looks) {
        // The same validation the player's own appearance passes.
        expect(validateAppearance(look.visual.appearance)).toEqual([]);
        const gear = visualEquipment(look.visual);
        for (const id of [gear.weapon, gear.outfit]) {
          if (id !== null) expect(getItem(id), id).toBeDefined();
        }
      }
    },
  );

  it("keeps friendly optics: no companion wears the hostile eye cue", () => {
    // Crimson and magenta are the enemy archetypes' warning colour
    // (see ./enemies.ts); somebody on your side never wears it.
    for (const companion of companions) {
      for (const look of companion.looks) {
        expect(
          ["crimson", "magenta"],
          `${companion.id}/${look.id}`,
        ).not.toContain(look.visual.appearance.eyeColor);
      }
    }
  });
});

describe("companionLook", () => {
  const vesper = getCompanion("vesper")!;

  it("returns the named look", () => {
    expect(companionLook(vesper, "quays-runner").id).toBe("quays-runner");
  });

  it("degrades an unknown look ref to the default rather than throwing", () => {
    expect(companionLook(vesper, "retired-in-a-later-build").id).toBe(
      vesper.defaultLookId,
    );
  });
});

describe("companion sprite ids", () => {
  it("round-trips the companion and the look it wears", () => {
    const id = companionSpriteId("vesper", "quays-runner");
    expect(parseCompanionSpriteId(id)).toEqual({
      companionId: "vesper",
      lookId: "quays-runner",
    });
  });

  it("keeps a re-dress a different id, and therefore a different bake", () => {
    expect(companionSpriteId("vesper", "quays-runner")).not.toBe(
      companionSpriteId("vesper", "spire-dress"),
    );
  });

  it("does not answer for anybody else's sprite id", () => {
    expect(parseCompanionSpriteId("player")).toBeNull();
    expect(parseCompanionSpriteId("nme-vent-crawler:1")).toBeNull();
    expect(parseCompanionSpriteId("")).toBeNull();
  });
});

describe("requireCompanion", () => {
  it("returns known companions and throws on the rest", () => {
    expect(requireCompanion("vesper").name).toBe("Vesper Kade");
    try {
      requireCompanion("nobody");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CompanionError);
      expect((error as CompanionError).code).toBe("unknown-companion");
    }
  });
});

describe("Vesper Kade, across the game", () => {
  const vesper = getCompanion("vesper")!;

  it("wears one face in the cast, on the map, and in the party", () => {
    const look = companionLook(vesper, vesper.defaultLookId).visual;
    expect(cast["Vesper Kade"]).toEqual(look);
    const npc = maps
      .flatMap((map) => map.interactables)
      .find((i) => i.id === "quays-kade");
    expect(npc?.visual).toEqual(look);
    expect(npc?.interaction).toEqual({ kind: "dialogue", nodeId: "fq-kade" });
  });

  it("is not the Chrome Chapel's stylist — two names, two people", () => {
    expect(cast["Vesper"]).toBeDefined();
    expect(cast["Vesper Kade"]).not.toEqual(cast["Vesper"]);
  });

  it("brings a signature weapon nothing else in the game carries", () => {
    expect(vesper.weaponId).toBe("wpn-hookline");
    expect(getItem("wpn-hookline")?.kind).toBe("weapon");
  });
});
