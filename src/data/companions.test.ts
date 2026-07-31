import { describe, expect, it } from "vitest";
import { validateAppearance, visualEquipment } from "../character";
import { STAT_KEYS } from "../character/stats";
import { getAbility } from "./abilities";
import { cast } from "./cast";
import {
  BOND_OUTCOMES,
  CompanionError,
  REACTION_TAGS,
  companionLook,
  companionSpriteId,
  companions,
  getCompanion,
  parseCompanionSpriteId,
  reactionValue,
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

  it.each(companions.map((c) => [c.id, c] as const))(
    "%s holds opinions, in both directions",
    (_id, companion) => {
      const values = Object.entries(companion.values);
      expect(values.length).toBeGreaterThan(0);
      for (const [tag] of values) {
        expect(REACTION_TAGS, `${companion.id} values "${tag}"`).toContain(tag);
      }
      // A companion who only ever approves is a companion whose loyalty
      // is a difficulty setting. Everybody has something they hate.
      const amounts = values.map(([, amount]) => amount);
      expect(Math.max(...amounts), companion.id).toBeGreaterThan(0);
      expect(Math.min(...amounts), companion.id).toBeLessThan(0);
      // Unknown tags are simply nothing to them.
      expect(reactionValue(companion, "not-a-tag")).toBe(0);
    },
  );

  it("puts the two of them on opposite sides of something", () => {
    // The loyalty axis only exists if the crew can disagree: at least
    // one kind of act one of them wants and the other cannot stand.
    const [vesper, sill] = [getCompanion("vesper")!, getCompanion("sill")!];
    const opposed = REACTION_TAGS.filter(
      (tag) => reactionValue(vesper, tag) * reactionValue(sill, tag) < 0,
    );
    expect(opposed.length).toBeGreaterThanOrEqual(2);
    // Named, because it is the spine of the arc: she takes it, he logs it.
    expect(opposed).toContain("salvage");
  });

  it.each(companions.map((c) => [c.id, c] as const))(
    "%s has one scene of their own, behind a threshold they can reach",
    (_id, companion) => {
      const scene = companion.personalScene;
      expect(scene.nodeId.length).toBeGreaterThan(0);
      expect(scene.loyalty).toBeGreaterThan(0);
      expect(scene.resolvedFlag.length).toBeGreaterThan(0);
    },
  );

  it("gives every companion their own scene and their own flag", () => {
    const nodeIds = companions.map((c) => c.personalScene.nodeId);
    const flags = companions.map((c) => c.personalScene.resolvedFlag);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it.each(companions.map((c) => [c.id, c] as const))(
    "%s has a later, quieter hour that sits beyond the first one",
    (_id, companion) => {
      const { personalScene, bondScene } = companion;
      expect(bondScene.nodeId.length).toBeGreaterThan(0);
      expect(bondScene.nodeId).not.toBe(personalScene.nodeId);
      // Costlier than the scene it comes after, or it is not "later".
      expect(bondScene.loyalty).toBeGreaterThan(personalScene.loyalty);
      expect(bondScene.progressFlag.length).toBeGreaterThan(0);
      expect(bondScene.resolvedFlag.length).toBeGreaterThan(0);
      expect(bondScene.resolvedFlag).not.toBe(personalScene.resolvedFlag);
    },
  );

  it("gives every companion their own later hour and their own flag", () => {
    const nodeIds = companions.map((c) => c.bondScene.nodeId);
    const flags = companions.map((c) => c.bondScene.resolvedFlag);
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it("keeps the three ways an hour can be left distinct", () => {
    expect(new Set(BOND_OUTCOMES).size).toBe(BOND_OUTCOMES.length);
    expect(BOND_OUTCOMES).toEqual(["warm", "distant", "betrayed"]);
  });

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

describe("Deacon Sill, across the game", () => {
  const sill = getCompanion("sill")!;

  it("wears one face in the cast, on the market boards, and in the party", () => {
    const look = companionLook(sill, sill.defaultLookId).visual;
    expect(cast["Deacon Sill"]).toEqual(look);
    const npc = maps
      .flatMap((map) => map.interactables)
      .find((i) => i.id === "market-auditor");
    expect(npc?.visual).toEqual(look);
    expect(npc?.interaction).toEqual({ kind: "dialogue", nodeId: "vm-auditor" });
  });

  it("brings a signature tool nothing else in the game carries", () => {
    expect(sill.weaponId).toBe("wpn-writ-seal");
    expect(getItem("wpn-writ-seal")?.kind).toBe("weapon");
  });

  it("is the crew's other shape: a thinker who cannot take a hit", () => {
    const vesper = getCompanion("vesper")!;
    expect(sill.stats.intelligence).toBeGreaterThan(vesper.stats.intelligence);
    expect(sill.stats.body).toBeLessThan(vesper.stats.body);
    expect(sill.maxHp).toBeLessThan(vesper.maxHp);
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
