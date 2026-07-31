import { describe, expect, it } from "vitest";
import {
  ENTITY_ART_KINDS,
  characterArt,
  droneArt,
  entityAttackClass,
  entityFrameKey,
  entityGrid,
  entityMuzzlePoint,
  mechArt,
} from "./entity";
import { BODY_FRAME } from "./layers/body";
import { skinToneRemap, type ComposedCharacter } from "./layers";
import { weaponArtId } from "./layers/weapons";
import { gridErrors } from "./pixel";

/**
 * The sprite-kind union. What matters here is that one set of questions
 * answers for both kinds — which frame, which key, which attack, where
 * the shot leaves — so that nothing downstream ever branches on what it
 * is drawing.
 */

const UNARMED: ComposedCharacter = {
  build: "lean",
  layers: [{ slot: "body", art: "lean", remap: skinToneRemap(0) }],
};

const GUNNER: ComposedCharacter = {
  build: "lean",
  layers: [
    { slot: "body", art: "lean", remap: {} },
    { slot: "weapon", art: weaponArtId("pistol", "lean"), remap: {} },
  ],
};

describe("entity art kinds", () => {
  it("names every kind the renderer knows", () => {
    expect([...ENTITY_ART_KINDS]).toEqual(["character", "drone", "mech"]);
  });

  it("tags what it wraps", () => {
    expect(characterArt(UNARMED).kind).toBe("character");
    expect(droneArt("static-drone").kind).toBe("drone");
    expect(mechArt("warden-chassis").kind).toBe("mech");
  });
});

describe("entityAttackClass", () => {
  it("reads a person's class off the weapon in its hands", () => {
    expect(entityAttackClass(characterArt(UNARMED))).toBe("unarmed");
    expect(entityAttackClass(characterArt(GUNNER))).toBe("pistol");
  });

  it("reads a chassis's class off the chassis", () => {
    expect(entityAttackClass(droneArt("static-drone"))).toBe("pistol");
  });
});

describe("entityFrameKey", () => {
  it("namespaces the kinds, so a chassis can never collide with a person", () => {
    const pose = ["e", "idle", 0] as const;
    const person = entityFrameKey(characterArt(UNARMED), ...pose);
    const machine = entityFrameKey(droneArt("static-drone"), ...pose);
    expect(person.startsWith("character|")).toBe(true);
    expect(machine.startsWith("drone|")).toBe(true);
    expect(person).not.toBe(machine);
  });

  it("separates every pose a drone can be in", () => {
    const art = droneArt("static-drone");
    const keys = [
      entityFrameKey(art, "e", "idle", 0),
      entityFrameKey(art, "e", "idle", 1),
      entityFrameKey(art, "s", "idle", 0),
      entityFrameKey(art, "e", "walk", 0),
      entityFrameKey(art, "e", "attack", 0),
      entityFrameKey(art, "e", "react", 0, { kind: "sparkout", awayX: 1 }),
      entityFrameKey(art, "e", "react", 0, { kind: "sparkout", awayX: -1 }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives one pose one key, so identical bodies share a bake", () => {
    const art = droneArt("static-drone");
    expect(entityFrameKey(art, "e", "idle", 2)).toBe(
      entityFrameKey(droneArt("static-drone"), "e", "idle", 2),
    );
  });
});

describe("entityGrid", () => {
  it("draws both kinds at the shared frame", () => {
    for (const art of [characterArt(UNARMED), droneArt("static-drone")]) {
      const grid = entityGrid(art, "e", "idle", 0);
      expect(gridErrors(grid)).toEqual([]);
      expect(grid.length).toBe(BODY_FRAME.height);
      expect(grid[0]?.length).toBe(BODY_FRAME.width);
    }
  });

  it("mirrors a chassis for the facings the whole figure flips on", () => {
    const art = droneArt("static-drone");
    const east = entityGrid(art, "e", "idle", 0);
    const south = entityGrid(art, "s", "idle", 0);
    expect(south).toEqual(east.map((row) => [...row].reverse().join("")));
  });

  it("refuses a reaction frame with no variant to draw it as", () => {
    expect(() =>
      entityGrid(droneArt("static-drone"), "e", "react", 0),
    ).toThrow(/variant/);
  });

  it("reports an out-of-range chassis frame instead of drawing nothing", () => {
    expect(() =>
      entityGrid(droneArt("static-drone"), "e", "idle", 99),
    ).toThrow(/frame 99/);
  });
});

describe("entityMuzzlePoint", () => {
  it("fires a person's shot from its weapon", () => {
    const point = entityMuzzlePoint(characterArt(GUNNER), "e");
    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(BODY_FRAME.width);
  });

  it("fires a chassis's shot from its stinger, inside the frame", () => {
    const point = entityMuzzlePoint(droneArt("static-drone"), "e");
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThan(BODY_FRAME.width);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThan(BODY_FRAME.height);
  });

  it("mirrors the muzzle with the figure on the flipped facings", () => {
    const art = droneArt("static-drone");
    const east = entityMuzzlePoint(art, "e");
    const south = entityMuzzlePoint(art, "s");
    expect(south.x).toBe(BODY_FRAME.width - 1 - east.x);
    expect(south.y).toBe(east.y);
  });
});
