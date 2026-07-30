import { describe, expect, it } from "vitest";
import {
  ATTACK_CLASS_IDS,
  ATTACK_TIMING,
  attackFrameCount,
  type AttackClassId,
} from "../../attack";
import type { Facing } from "../../animation";
import { composedCharacterGrid, type ComposedCharacter } from "../layers";
import { gridErrors, type PixelGrid } from "../pixel";
import {
  ATTACK_FRAMES,
  ATTACK_WEAPON_GRIDS,
  ATTACK_WEAPON_REGION,
  MUZZLE_POINTS,
  attackWeaponGrid,
  muzzlePoint,
} from "./attack";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_VIEW_IDS,
  type BodyBuildId,
} from "./body";
import { weaponArtId } from "./weapons";

/**
 * The per-class attack sets: authored weapon frames, the composed pose
 * they are drawn onto, and the anchor contract every frame of every
 * class has to keep. Painting is not under test — what is: that the art
 * is valid, stays where it promised to, moves, and never drifts against
 * the ground.
 */

const FACINGS: Facing[] = ["n", "e", "s", "w"];

/**
 * Channels an attack frame's weapon may draw: chrome metal (6/T/9),
 * the energy-glow accent ramp (l/j/k), outline/ink structure, and the
 * amber pair muzzle flash burns in.
 */
const CHANNELS = ["0", "1", "6", "T", "9", "l", "j", "k", "m", "n"] as const;

/** Classes that actually hold something; bare hands draw no weapon. */
const ARMED = ATTACK_CLASS_IDS.filter((id) => id !== "unarmed");

/* The body never uses synth-violet ("P"), so remapping every weapon
 * channel onto it makes weapon pixels uniquely countable in composed
 * frames — the same marker trick the resting layer tests use. */
const MARKER = "P";
const markerRemap = Object.fromEntries(CHANNELS.map((ch) => [ch, MARKER]));

function opaqueCells(grid: PixelGrid): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== ".") cells.push([x, y]);
    });
  });
  return cells;
}

function countChar(grid: PixelGrid, ch: string): number {
  return grid.reduce((sum, row) => sum + [...row].filter((c) => c === ch).length, 0);
}

/** Lowest row above the shadow band holding any opaque pixel. */
function bottomBodyRow(grid: PixelGrid): number {
  for (let y = BODY_FRAME.shadow.top - 1; y >= 0; y--) {
    if ([...(grid[y] ?? "")].some((ch) => ch !== ".")) return y;
  }
  return -1;
}

/** A bare-build character swinging the class's weapon, marker-remapped. */
function fighter(
  attackClass: AttackClassId,
  build: BodyBuildId,
): ComposedCharacter {
  return {
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      ...(attackClass === "unarmed"
        ? []
        : [
            {
              slot: "weapon" as const,
              art: weaponArtId(attackClass, build),
              remap: markerRemap,
            },
          ]),
    ],
  };
}

/** Every (class, build, view, frame) weapon grid, labeled. */
const WEAPON_GRIDS = ARMED.flatMap((id) =>
  BODY_BUILD_IDS.flatMap((build) =>
    BODY_VIEW_IDS.flatMap((view) =>
      ATTACK_WEAPON_GRIDS[id][build][view].map((grid, frame) => ({
        id,
        build,
        view,
        frame,
        label: `${id} ${build} ${view} f${frame}`,
        grid,
      })),
    ),
  ),
);

describe("authored attack sets", () => {
  it("gives every class the frame count its timing declares", () => {
    for (const id of ATTACK_CLASS_IDS) {
      expect(ATTACK_FRAMES[id].length, `${id} frames`).toBe(attackFrameCount(id));
      for (const build of BODY_BUILD_IDS) {
        for (const view of BODY_VIEW_IDS) {
          expect(
            ATTACK_WEAPON_GRIDS[id][build][view].length,
            `${id} ${build} ${view}`,
          ).toBe(attackFrameCount(id));
        }
      }
    }
  });

  it("arms every weapon class on every frame and leaves bare hands empty", () => {
    for (const id of ARMED) {
      for (const build of BODY_BUILD_IDS) {
        for (const view of BODY_VIEW_IDS) {
          for (let frame = 0; frame < attackFrameCount(id); frame++) {
            const grid = attackWeaponGrid(id, build, view, frame);
            expect(grid, `${id} ${build} ${view} f${frame}`).not.toBeNull();
            expect(
              opaqueCells(grid ?? []).length,
              `${id} ${build} ${view} f${frame} pixels`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
    for (let frame = 0; frame < attackFrameCount("unarmed"); frame++) {
      expect(attackWeaponGrid("unarmed", "lean", "front", frame)).toBeNull();
    }
  });

  it("throws for a frame the class never authored", () => {
    expect(() => attackWeaponGrid("blade", "lean", "front", 99)).toThrow(
      /no blade attack frame 99/,
    );
  });

  it("every weapon frame is a valid 32×48 palette grid", () => {
    for (const { grid, label } of WEAPON_GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, `${label} height`).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, `${label} width`).toBe(BODY_FRAME.width);
    }
  });

  it("draws only in the weapon channels", () => {
    const allowed = new Set<string>([...CHANNELS, "."]);
    for (const { grid, label } of WEAPON_GRIDS) {
      for (const row of grid) {
        for (const ch of row) {
          expect(allowed.has(ch), `${label} uses "${ch}"`).toBe(true);
        }
      }
    }
  });

  it("keeps every weapon pixel inside the attack region", () => {
    for (const { grid, label } of WEAPON_GRIDS) {
      for (const [x, y] of opaqueCells(grid)) {
        expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(
          ATTACK_WEAPON_REGION.top,
        );
        expect(y, `${label} row ${y}`).toBeLessThanOrEqual(
          ATTACK_WEAPON_REGION.bottom,
        );
        expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(
          ATTACK_WEAPON_REGION.left,
        );
        expect(x, `${label} col ${x}`).toBeLessThanOrEqual(
          ATTACK_WEAPON_REGION.right,
        );
      }
    }
  });

  it("aligns the heavy build's grip by the same one-column hand shift", () => {
    const shift =
      BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0];
    for (const id of ARMED) {
      for (const view of BODY_VIEW_IDS) {
        ATTACK_WEAPON_GRIDS[id].lean[view].forEach((lean, frame) => {
          const heavy = ATTACK_WEAPON_GRIDS[id].heavy[view][frame] ?? [];
          const label = `${id} ${view} f${frame}`;
          expect(opaqueCells(heavy).length, `${label} pixel count`).toBe(
            opaqueCells(lean).length,
          );
          for (const [x, y] of opaqueCells(lean)) {
            expect(heavy[y]?.[x + shift], `${label} (${x},${y})`).toBe(
              lean[y]?.[x],
            );
          }
        });
      }
    }
  });

  it("dims the lit edge on the back view without changing the silhouette", () => {
    for (const id of ARMED) {
      for (const build of BODY_BUILD_IDS) {
        ATTACK_WEAPON_GRIDS[id][build].front.forEach((front, frame) => {
          const back = ATTACK_WEAPON_GRIDS[id][build].back[frame] ?? [];
          const label = `${id} ${build} f${frame}`;
          expect(opaqueCells(back), `${label} silhouette`).toEqual(
            opaqueCells(front),
          );
          // The camera-facing specular never survives to the back view.
          expect(countChar(back, "9"), `${label} specular`).toBe(0);
        });
      }
    }
  });

  it("moves the weapon between frames — no class swings a still image", () => {
    for (const id of ARMED) {
      const frames = ATTACK_WEAPON_GRIDS[id].lean.front;
      for (let i = 1; i < frames.length; i++) {
        expect(frames[i], `${id} f${i} differs from f${i - 1}`).not.toEqual(
          frames[i - 1],
        );
      }
    }
  });
});

describe("composed attack frames", () => {
  const COMPOSED = ATTACK_CLASS_IDS.flatMap((id) =>
    BODY_BUILD_IDS.flatMap((build) =>
      FACINGS.flatMap((facing) =>
        Array.from({ length: attackFrameCount(id) }, (_, frame) => ({
          id,
          build,
          facing,
          frame,
          label: `${id} ${build} ${facing} f${frame}`,
          grid: composedCharacterGrid(fighter(id, build), facing, "attack", frame),
        })),
      ),
    ),
  );

  it("composes a valid 32×48 grid for every class, build, facing, and frame", () => {
    for (const { grid, label } of COMPOSED) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, `${label} height`).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, `${label} width`).toBe(BODY_FRAME.width);
    }
  });

  it("keeps the anchored ground shadow identical on every frame", () => {
    for (const { id, build, facing, grid, label } of COMPOSED) {
      const rest = composedCharacterGrid(fighter(id, build), facing, "idle", 0);
      expect(grid.slice(BODY_FRAME.shadow.top), label).toEqual(
        rest.slice(BODY_FRAME.shadow.top),
      );
    }
  });

  it("keeps the feet planted: no attack frame drifts off its tile", () => {
    for (const { id, build, facing, grid, label } of COMPOSED) {
      const rest = composedCharacterGrid(fighter(id, build), facing, "idle", 0);
      expect(bottomBodyRow(grid), `${label} bottom row`).toBe(bottomBodyRow(rest));
    }
  });

  it("carries the weapon through the swing on every armed frame", () => {
    for (const { id, facing, grid, label } of COMPOSED) {
      // Facing away the weapon draws behind the body, so a frame that
      // holds it low and back (a coiled lash) is legitimately hidden;
      // toward camera it must always read.
      if (id === "unarmed" || facing === "n" || facing === "w") continue;
      expect(countChar(grid, MARKER), `${label} weapon pixels`).toBeGreaterThan(0);
    }
  });

  it("actually moves: every frame differs from the resting pose", () => {
    for (const { id, build, facing, grid, label } of COMPOSED) {
      const rest = composedCharacterGrid(fighter(id, build), facing, "idle", 0);
      expect(grid, `${label} differs from idle`).not.toEqual(rest);
    }
  });

  it("throws melee weight into the blow and pushes ranged classes off it", () => {
    // The lean is the whole-body tell, and it agrees with the class's
    // lunge: a swing drives into the target on the impact frame, a shot
    // shoves the shooter back off the frame that fires.
    for (const id of ATTACK_CLASS_IDS) {
      const { impactFrame, lungePx } = ATTACK_TIMING[id];
      const windUp = ATTACK_FRAMES[id][impactFrame - 1]?.leanX ?? 0;
      const impact = ATTACK_FRAMES[id][impactFrame]?.leanX ?? 0;
      if (lungePx > 0) {
        expect(impact, `${id} commits into the blow`).toBeGreaterThan(windUp);
      } else {
        expect(impact, `${id} rides the recoil`).toBeLessThan(windUp);
      }
    }
  });

  it("reaches the weapon hand out on every frame of every class", () => {
    for (const id of ATTACK_CLASS_IDS) {
      for (const [frame, authored] of ATTACK_FRAMES[id].entries()) {
        expect(
          Math.abs(authored.handDx) + Math.abs(authored.handDy),
          `${id} f${frame} hand reach`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("mirrors the away facings off the authored views", () => {
    for (const id of ATTACK_CLASS_IDS) {
      for (let frame = 0; frame < attackFrameCount(id); frame++) {
        const east = composedCharacterGrid(fighter(id, "lean"), "e", "attack", frame);
        const south = composedCharacterGrid(fighter(id, "lean"), "s", "attack", frame);
        expect(south, `${id} f${frame} mirrored`).toEqual(
          east.map((row) => [...row].reverse().join("")),
        );
      }
    }
  });
});

/**
 * The muzzle contract: where a class's blow leaves the character, which
 * is where the combat scene starts its tracer and burns its muzzle
 * flash. The point has to sit on the picture rather than near it, so it
 * is pinned to the flash pixel the firing frame already lights.
 */
describe("the muzzle contract", () => {
  const RANGED: AttackClassId[] = ["pistol", "rifle"];

  it("names a muzzle for the classes that fire and none for the rest", () => {
    for (const id of ATTACK_CLASS_IDS) {
      expect(MUZZLE_POINTS[id] !== undefined, id).toBe(RANGED.includes(id));
    }
  });

  it("puts the authored muzzle on the flash the firing frame lights", () => {
    for (const id of RANGED) {
      const authored = MUZZLE_POINTS[id];
      if (!authored) throw new Error(`${id} has no muzzle point`);
      const frame = ATTACK_TIMING[id].impactFrame;
      for (const build of BODY_BUILD_IDS) {
        const shift =
          build === "heavy"
            ? BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0]
            : 0;
        const grid = ATTACK_WEAPON_GRIDS[id][build].front[frame] ?? [];
        // The hot end of the amber pair: the flame at the barrel.
        expect(grid[authored.y]?.[authored.x + shift], `${id} ${build} muzzle`).toBe(
          "n",
        );
      }
    }
  });

  it("moves the muzzle with the frame's own lean and landed weight", () => {
    for (const id of RANGED) {
      const authored = MUZZLE_POINTS[id];
      const frame = ATTACK_FRAMES[id][ATTACK_TIMING[id].impactFrame];
      if (!authored || !frame) throw new Error(`${id} has no firing frame`);
      const point = muzzlePoint(id, "lean", "e");
      expect(point.x, `${id} leans with the body`).toBe(authored.x + frame.leanX);
      expect(point.y, `${id} sinks with the body`).toBe(
        authored.y + (frame.sink === true ? 1 : 0),
      );
    }
  });

  it("falls back to the fist for everything that fires nothing", () => {
    for (const id of ATTACK_CLASS_IDS.filter((c) => !RANGED.includes(c))) {
      const frame = ATTACK_FRAMES[id][ATTACK_TIMING[id].impactFrame];
      if (!frame) throw new Error(`${id} has no impact frame`);
      for (const build of BODY_BUILD_IDS) {
        const hands = BODY_FRAME.hands[build];
        const point = muzzlePoint(id, build, "e");
        expect(point.x, `${id} ${build} fist x`).toBe(
          hands.right[1] + frame.handDx + frame.leanX,
        );
        expect(point.y, `${id} ${build} fist y`).toBe(
          hands.rows[1] + frame.handDy + (frame.sink === true ? 1 : 0),
        );
      }
    }
  });

  it("mirrors the muzzle onto the away facings, and keeps it in frame", () => {
    for (const id of ATTACK_CLASS_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const east = muzzlePoint(id, build, "e");
        for (const facing of FACINGS) {
          const point = muzzlePoint(id, build, facing);
          const mirrors = facing === "s" || facing === "w";
          expect(point.x, `${id} ${build} ${facing}`).toBe(
            mirrors ? BODY_FRAME.width - 1 - east.x : east.x,
          );
          expect(point.y, `${id} ${build} ${facing} height`).toBe(east.y);
          // A muzzle outside the frame would fire from thin air.
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThan(BODY_FRAME.width);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThan(BODY_FRAME.height);
        }
      }
    }
  });

  it("fires from above the ground and below the head", () => {
    // Shoulder-to-hip: a shot leaves a weapon a body is holding, not
    // its boots and not its face.
    for (const id of ATTACK_CLASS_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const { y } = muzzlePoint(id, build, "e");
        expect(y, `${id} ${build} above the head box`).toBeGreaterThan(
          BODY_FRAME.head.bottom,
        );
        expect(y, `${id} ${build} above the ground`).toBeLessThan(
          BODY_FRAME.shadow.top,
        );
      }
    }
  });
});
