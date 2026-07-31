import { describe, expect, it } from "vitest";
import {
  encounters,
  getEncounter,
  requireEncounter,
  spawnLookIndex,
  spawnLookSeed,
} from "./encounters";
import { enemyLookCount, getEnemy, requireEnemy } from "./enemies";
import { requireMap } from "./maps";

/**
 * Encounter content, and the one decision it makes about how a fight
 * looks: which record of an archetype's look family each slot wears.
 */

describe("encounter registry", () => {
  it("looks up encounters by id and throws on unknown ids", () => {
    expect(getEncounter("enc-auric-scout")?.name).toBe("Auric Scout Team");
    expect(getEncounter("enc-nobody")).toBeUndefined();
    expect(() => requireEncounter("enc-nobody")).toThrow(/No encounter/);
  });

  it("spawns only real archetypes onto real arenas of the right size", () => {
    for (const encounter of encounters) {
      const map = requireMap(encounter.arenaMapId);
      expect(map.width, `${encounter.id} arena width`).toBe(
        encounter.grid.width,
      );
      expect(map.height, `${encounter.id} arena height`).toBe(
        encounter.grid.height,
      );
      for (const spawn of encounter.enemies) {
        expect(
          getEnemy(spawn.enemyId),
          `${encounter.id} spawns ${spawn.enemyId}`,
        ).toBeTruthy();
      }
    }
  });
});

describe("spawnLookSeed", () => {
  it("is stable for an encounter and slot, and differs between them", () => {
    expect(spawnLookSeed("enc-rustyard-ambush", 0)).toBe(
      spawnLookSeed("enc-rustyard-ambush", 0),
    );
    expect(spawnLookSeed("enc-rustyard-ambush", 0)).not.toBe(
      spawnLookSeed("enc-rustyard-ambush", 1),
    );
    expect(spawnLookSeed("enc-rustyard-ambush", 0)).not.toBe(
      spawnLookSeed("enc-collectors", 0),
    );
  });
});

describe("spawnLookIndex", () => {
  it("honors a pinned look", () => {
    const spawn = { enemyId: "nme-court-sapper", position: { x: 0, y: 0 }, look: 2 };
    expect(spawnLookIndex("enc-anything", 0, spawn)).toBe(2);
  });

  it("clamps a pin that points outside the family", () => {
    const spawn = { enemyId: "nme-court-sapper", position: { x: 0, y: 0 } };
    const family = enemyLookCount(requireEnemy("nme-court-sapper"));
    expect(spawnLookIndex("enc-anything", 0, { ...spawn, look: 99 })).toBe(
      family - 1,
    );
    expect(spawnLookIndex("enc-anything", 0, { ...spawn, look: -3 })).toBe(0);
  });

  it("picks the same look every time for an unpinned slot", () => {
    const spawn = { enemyId: "nme-cordon-enforcer", position: { x: 0, y: 0 } };
    const first = spawnLookIndex("enc-exchange-gate", 1, spawn);
    for (let i = 0; i < 20; i++) {
      expect(spawnLookIndex("enc-exchange-gate", 1, spawn)).toBe(first);
    }
  });

  it("keeps every pick inside the archetype's family", () => {
    for (const encounter of encounters) {
      encounter.enemies.forEach((spawn, slot) => {
        const enemy = requireEnemy(spawn.enemyId);
        const index = spawnLookIndex(encounter.id, slot, spawn);
        expect(index, `${encounter.id} slot ${slot}`).toBeGreaterThanOrEqual(0);
        expect(index, `${encounter.id} slot ${slot}`).toBeLessThan(
          enemyLookCount(enemy),
        );
      });
    }
  });

  it("gives an archetype with one authored look the only look it has", () => {
    const drone = { enemyId: "nme-static-drone", position: { x: 0, y: 0 } };
    expect(spawnLookIndex("enc-auric-scout", 1, drone)).toBe(0);
    expect(spawnLookIndex("enc-auric-scout", 1, { ...drone, look: 5 })).toBe(0);
  });

  it("treats an unknown archetype as having one look rather than throwing", () => {
    const ghost = { enemyId: "nme-nobody", position: { x: 0, y: 0 } };
    expect(spawnLookIndex("enc-auric-scout", 0, ghost)).toBe(0);
  });

  it("varies the faces across the slots of a squad", () => {
    // Not a guarantee of the pick — a guarantee that the roster is
    // authored so the seeded picks can differ at all. Every encounter
    // fielding three of one archetype should not be three of one face.
    const squads = encounters.filter((encounter) => {
      const ids = encounter.enemies.map((e) => e.enemyId);
      return new Set(ids).size === 1 && ids.length >= 3;
    });
    expect(squads.length, "the roster has a squad to check").toBeGreaterThan(0);
    for (const encounter of squads) {
      const picks = encounter.enemies.map((spawn, slot) =>
        spawnLookIndex(encounter.id, slot, spawn),
      );
      expect(new Set(picks).size, encounter.id).toBeGreaterThan(1);
    }
  });
});
