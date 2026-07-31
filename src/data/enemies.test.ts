import { describe, expect, it } from "vitest";
import {
  composeVisual,
  validateAppearance,
  type CharacterVisual,
} from "../character";
import { composedCharacterKey } from "../iso/art/layers";
import { DRONE_ART } from "../iso/art/drone";
import { MECH_ART } from "../iso/art/mech";
import { requireAbility } from "./abilities";
import { ENHANCEMENT_SLOTS } from "../inventory/items";
import {
  enemies,
  enemyLook,
  enemyLookCount,
  enemySpriteId,
  getEnemy,
  parseEnemySpriteId,
  requireEnemy,
  type Enemy,
  type HumanoidEnemy,
} from "./enemies";
import { getItem } from "./items";

/** Every humanoid archetype, narrowed so its family is reachable. */
const humanoids: HumanoidEnemy[] = enemies.filter(
  (enemy): enemy is HumanoidEnemy => enemy.spriteKind === "humanoid",
);

/** Every authored look in the roster, labelled by archetype and index. */
function allLooks(): ReadonlyArray<{ label: string; visual: CharacterVisual }> {
  return humanoids.flatMap((enemy) =>
    enemy.looks.map((visual, i) => ({ label: `${enemy.id} look${i}`, visual })),
  );
}

describe("enemy registry", () => {
  it("looks up enemies by id and throws on unknown ids", () => {
    expect(getEnemy("nme-auric-agent")?.name).toBe("Auric Retrieval Agent");
    expect(getEnemy("nme-nobody")).toBeUndefined();
    expect(requireEnemy("nme-rustyard-bruiser").maxHp).toBeGreaterThan(0);
    expect(() => requireEnemy("nme-nobody")).toThrow(/No enemy/);
  });
});

describe("enemy chassis", () => {
  it("says what every archetype is made of, and the roster has both", () => {
    const kinds = new Set(enemies.map((e) => e.chassis));
    for (const enemy of enemies) {
      expect(["flesh", "machine"], enemy.id).toContain(enemy.chassis);
    }
    expect(kinds, "the Sprawl fights both").toEqual(
      new Set(["flesh", "machine"]),
    );
  });

  it("counts the drones and the chassis as machines", () => {
    // What the fiction calls a machine dies like one (a spark-out
    // rather than a crumple); the people do not.
    expect(requireEnemy("nme-static-drone").chassis).toBe("machine");
    expect(requireEnemy("nme-vault-sentinel").chassis).toBe("machine");
    expect(requireEnemy("nme-pump-custodian").chassis).toBe("machine");
    expect(requireEnemy("nme-auric-agent").chassis).toBe("flesh");
    expect(requireEnemy("nme-rustyard-bruiser").chassis).toBe("flesh");
  });
});

describe("sprite kinds", () => {
  it("every archetype declares which art system draws it", () => {
    for (const enemy of enemies) {
      expect(["humanoid", "drone", "mech"], enemy.id).toContain(
        enemy.spriteKind,
      );
    }
  });

  it("the roster fights both people and things that never were", () => {
    expect(new Set(enemies.map((e) => e.spriteKind))).toEqual(
      new Set(["humanoid", "drone", "mech"]),
    );
  });

  it("a drone archetype names an authored chassis and carries no looks", () => {
    const drone = requireEnemy("nme-static-drone");
    expect(drone.spriteKind).toBe("drone");
    if (drone.spriteKind !== "drone") return;
    expect(DRONE_ART[drone.droneArt], "the chassis is authored").toBeTruthy();
    // One look, resolvable through the same helpers as anyone else, so
    // callers never branch on the kind to count faces.
    expect(enemyLookCount(drone)).toBe(1);
    expect(enemyLook(drone, 0)).toBeUndefined();
  });

  it("a mech archetype names an authored chassis and carries no looks", () => {
    const mech = requireEnemy("nme-warden-chassis");
    expect(mech.spriteKind).toBe("mech");
    if (mech.spriteKind !== "mech") return;
    expect(MECH_ART[mech.mechArt], "the chassis is authored").toBeTruthy();
    expect(enemyLookCount(mech)).toBe(1);
    expect(enemyLook(mech, 0)).toBeUndefined();
  });
});

/**
 * Footprints are a plain field on every archetype, not a property of
 * being a boss — so the roster is checked as a roster: almost everything
 * stands on one tile, whatever declares more declares something sane,
 * and the one that does is the one the content says it is.
 */
describe("footprints", () => {
  it("leaves almost everything on the single tile it always stood on", () => {
    const big = enemies.filter((e) => e.footprint !== undefined);
    expect(big.map((e) => e.id)).toEqual(["nme-warden-chassis"]);
  });

  it("declares whole tiles, at least one in each direction", () => {
    for (const enemy of enemies) {
      if (!enemy.footprint) continue;
      const { width, height } = enemy.footprint;
      for (const [label, value] of [["width", width], ["height", height]] as const) {
        expect(Number.isInteger(value), `${enemy.id} ${label}`).toBe(true);
        expect(value, `${enemy.id} ${label}`).toBeGreaterThanOrEqual(1);
        // Bigger than a 3×3 would not fit the smallest arena with room
        // to fight around it; nothing has needed one.
        expect(value, `${enemy.id} ${label}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("gives the Warden Chassis the 2x2 block its art is drawn over", () => {
    const warden = requireEnemy("nme-warden-chassis");
    expect(warden.footprint).toEqual({ width: 2, height: 2 });
    // A machine, so it sparks out rather than crumpling.
    expect(warden.chassis).toBe("machine");
    // And it fights with both of the things its art can swing: a piston
    // up close and a shoulder battery it announces a turn ahead.
    expect(warden.abilityIds).toContain("ability-piston-smash");
    expect(warden.abilityIds).toContain("ability-shoulder-volley");
    expect(
      requireAbility("ability-shoulder-volley").windUp,
      "the volley is telegraphed",
    ).toBeGreaterThan(0);
  });
});

describe("archetype look families", () => {
  it("every humanoid archetype has a family of two or three records", () => {
    for (const enemy of humanoids) {
      expect(enemy.looks.length, enemy.id).toBeGreaterThanOrEqual(2);
      expect(enemy.looks.length, enemy.id).toBeLessThanOrEqual(3);
      expect(enemyLookCount(enemy), enemy.id).toBe(enemy.looks.length);
    }
  });

  it("every record's appearance validates against the catalogs", () => {
    for (const { label, visual } of allLooks()) {
      expect(validateAppearance(visual.appearance), label).toEqual([]);
    }
  });

  it("authored gear resolves to real items of the right kind that actually draw", () => {
    for (const { label, visual } of allLooks()) {
      const { weapon, outfit, enhancements } = visual;
      if (weapon !== undefined) {
        const item = getItem(weapon);
        expect(item?.kind, `${label} weapon ${weapon}`).toBe("weapon");
        expect(
          item?.kind === "weapon" && item.weaponLayer,
          `${label} weapon ${weapon} has a layer`,
        ).toBeTruthy();
      }
      if (outfit !== undefined) {
        const item = getItem(outfit);
        expect(item?.kind, `${label} outfit ${outfit}`).toBe("outfit");
        expect(
          item?.kind === "outfit" && item.outfitLayer,
          `${label} outfit ${outfit} has a layer`,
        ).toBeTruthy();
      }
      for (const slot of ENHANCEMENT_SLOTS) {
        const id = enhancements?.[slot];
        if (id === undefined) continue;
        const item = getItem(id);
        expect(item?.kind, `${label} ${slot} ${id}`).toBe("enhancement");
        if (item?.kind !== "enhancement") continue;
        expect(item.slot, `${label} ${slot} ${id} slot match`).toBe(slot);
        expect(item.cyberLayer, `${label} ${slot} ${id} has a layer`).toBeTruthy();
      }
    }
  });

  it("a crew dye only ever colors cloth the look is actually wearing", () => {
    for (const { label, visual } of allLooks()) {
      if (!visual.outfitDye) continue;
      const item = visual.outfit === undefined ? undefined : getItem(visual.outfit);
      expect(
        item?.kind === "outfit" && item.outfitLayer,
        `${label} dyes an outfit layer it wears`,
      ).toBeTruthy();
    }
  });

  it("a crew dye always changes the coat — a dye that repaints nothing is a dye somebody forgot", () => {
    for (const { label, visual } of allLooks()) {
      if (!visual.outfitDye) continue;
      expect(
        composedCharacterKey(composeVisual(visual)),
        `${label} dye is visible`,
      ).not.toBe(
        composedCharacterKey(composeVisual({ ...visual, outfitDye: undefined })),
      );
    }
  });

  it("hostility reads through the data: every record wears the crimson/magenta optic", () => {
    for (const { label, visual } of allLooks()) {
      expect(["crimson", "magenta"], label).toContain(
        visual.appearance.eyeColor,
      );
    }
  });

  it("every record in the roster composes into a look no other record has", () => {
    const looks = allLooks();
    const keys = looks.map(({ visual }) =>
      composedCharacterKey(composeVisual(visual)),
    );
    // Distinct across the whole roster, not just within a family: two
    // archetypes that composed alike would be one enemy with two names.
    expect(new Set(keys).size, keys.join("\n")).toBe(looks.length);
  });

  it("clamps a look index into the family rather than blanking a sprite", () => {
    const agent = requireEnemy("nme-auric-agent") as Enemy;
    if (agent.spriteKind !== "humanoid") throw new Error("expected a humanoid");
    expect(enemyLook(agent, -4)).toBe(agent.looks[0]);
    expect(enemyLook(agent, 99)).toBe(agent.looks[agent.looks.length - 1]);
    expect(enemyLook(agent, 1)).toBe(agent.looks[1]);
  });
});

describe("enemy sprite ids", () => {
  it("round-trips an archetype and the look it wears", () => {
    const id = enemySpriteId("nme-cordon-enforcer", 2);
    expect(parseEnemySpriteId(id)).toEqual({
      enemyId: "nme-cordon-enforcer",
      lookIndex: 2,
    });
  });

  it("gives two records of one family two different ids", () => {
    expect(enemySpriteId("nme-court-sapper", 0)).not.toBe(
      enemySpriteId("nme-court-sapper", 1),
    );
  });

  it("reads a bare archetype id as its canonical look", () => {
    expect(parseEnemySpriteId("nme-auric-agent")).toEqual({
      enemyId: "nme-auric-agent",
      lookIndex: 0,
    });
    expect(parseEnemySpriteId("nme-auric-agent#zzz")).toEqual({
      enemyId: "nme-auric-agent",
      lookIndex: 0,
    });
  });
});
