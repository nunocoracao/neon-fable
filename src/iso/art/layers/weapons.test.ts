import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type LoopState } from "../../animation";
import {
  composedCharacterGrid,
  layerArtGrid,
  type ComposedCharacter,
} from "../layers";
import { gridErrors, remapped, type PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_VIEW_IDS,
  type BodyBuildId,
} from "./body";
import {
  WEAPON_CLASS_IDS,
  WEAPON_GRIDS,
  WEAPON_LAYERS,
  WEAPON_REGION,
  weaponArtId,
  type WeaponClassId,
} from "./weapons";

const STATES: LoopState[] = ["idle", "walk"];
const FACINGS: Facing[] = ["n", "e", "s", "w"];

/** The palette characters weapon layers may draw: chrome metal (6/T/9),
 * the energy-glow accent channel (l/j/k), and outline/ink structure. */
const CHANNELS = ["0", "1", "6", "T", "9", "l", "j", "k"] as const;

/** Every (class, build, view, grid) tuple, labeled for assertions. */
const GRIDS = WEAPON_CLASS_IDS.flatMap((id) =>
  BODY_BUILD_IDS.flatMap((build) =>
    BODY_VIEW_IDS.map((view) => ({
      id,
      build,
      view,
      label: `${id} ${build} ${view}`,
      grid: WEAPON_LAYERS[id][build][view],
    })),
  ),
);

function pixelCells(grid: PixelGrid, ch: string): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === ch) cells.push([x, y]);
    });
  });
  return cells;
}

function opaqueCells(grid: PixelGrid): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== ".") cells.push([x, y]);
    });
  });
  return cells;
}

/* The body never uses synth-violet ("P"), so remapping every weapon
 * channel onto it makes weapon pixels uniquely countable in composed
 * frames — the same marker trick the other layer tests use. */
const MARKER = "P";
const markerRemap = Object.fromEntries(CHANNELS.map((ch) => [ch, MARKER]));

/** A bare-build character holding only the weapon, marker-remapped. */
function armedCharacter(
  id: WeaponClassId,
  build: BodyBuildId,
): ComposedCharacter {
  return {
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "weapon", art: weaponArtId(id, build), remap: markerRemap },
    ],
  };
}

describe("weapon layer grids", () => {
  it("every class, build, and view is a valid 32×48 frame grid", () => {
    for (const { label, grid } of GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, label).toBe(BODY_FRAME.width);
    }
  });

  it("draws only the weapon channels, and a real amount of pixels", () => {
    for (const { label, grid } of GRIDS) {
      const chars = [...new Set(grid.join("").replace(/\./g, ""))];
      for (const ch of chars) {
        expect(CHANNELS, `${label} draws "${ch}"`).toContain(ch);
      }
      expect(opaqueCells(grid).length, label).toBeGreaterThan(4);
    }
  });

  it("stays inside the weapon region (clear of head, legs, and frame edges)", () => {
    for (const { label, grid } of GRIDS) {
      for (const [x, y] of opaqueCells(grid)) {
        expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(WEAPON_REGION.top);
        expect(y, `${label} row ${y}`).toBeLessThanOrEqual(WEAPON_REGION.bottom);
        expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(WEAPON_REGION.left);
        expect(x, `${label} col ${x}`).toBeLessThanOrEqual(WEAPON_REGION.right);
      }
    }
  });

  it("leaves both builds' bare-skin hand windows transparent", () => {
    for (const { build, label, grid } of GRIDS) {
      const hands = BODY_FRAME.hands[build];
      for (const y of hands.rows) {
        for (const x of [...hands.left, ...hands.right]) {
          expect(grid[y]?.[x], `${label} hand pixel (${x}, ${y})`).toBe(".");
        }
      }
    }
  });

  it("grips the leading hand: an opaque pixel touches the right hand window", () => {
    for (const { build, label, grid } of GRIDS) {
      const hands = BODY_FRAME.hands[build];
      const touches = opaqueCells(grid).some(([x, y]) =>
        hands.rows.some((hy) =>
          hands.right.some(
            (hx) => Math.abs(x - hx) <= 1 && Math.abs(y - hy) <= 1,
          ),
        ),
      );
      expect(touches, `${label} touches the hand`).toBe(true);
    }
  });

  it("heavy grids are the lean grids shifted by the builds' hand offset", () => {
    const dx =
      BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0];
    for (const id of WEAPON_CLASS_IDS) {
      for (const view of BODY_VIEW_IDS) {
        const lean = opaqueCells(WEAPON_LAYERS[id]["lean"][view]);
        const heavy = opaqueCells(WEAPON_LAYERS[id]["heavy"][view]);
        expect(
          heavy,
          `${id} ${view} heavy = lean + ${dx} columns`,
        ).toEqual(lean.map(([x, y]) => [x + dx, y]));
      }
    }
  });

  it("classes are distinct per build, and views differ per class", () => {
    const keys = GRIDS.map(({ grid }) => grid.join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marker remaps recolor every pixel without losing any", () => {
    for (const { label, grid } of GRIDS) {
      const opaque = opaqueCells(grid).length;
      const marked = remapped(grid, markerRemap);
      expect(gridErrors(marked), label).toEqual([]);
      expect(pixelCells(marked, MARKER).length, label).toBe(opaque);
    }
  });
});

describe("registry wiring", () => {
  it("registers every class under its per-build art id", () => {
    for (const { id, build, view, label, grid } of GRIDS) {
      expect(layerArtGrid("weapon", weaponArtId(id, build), view), label).toEqual(
        grid,
      );
    }
    expect(Object.keys(WEAPON_GRIDS).sort()).toEqual(
      WEAPON_CLASS_IDS.flatMap((id) =>
        BODY_BUILD_IDS.map((build) => weaponArtId(id, build)),
      ).sort(),
    );
  });

  it("returns null for unknown classes, bare item ids, and bare class ids", () => {
    expect(layerArtGrid("weapon", "chainsword@lean", "front")).toBeNull();
    expect(layerArtGrid("weapon", "wpn-shard-knife", "front")).toBeNull();
    expect(layerArtGrid("weapon", "blade", "front")).toBeNull();
    expect(layerArtGrid("weapon", weaponArtId("blade", "lean"), "front"))
      .not.toBeNull();
  });
});

describe("hand alignment through the composed pipeline", () => {
  /* Fixed pixel assertions on the neutral pose (idle frame 0), per
   * facing: the rifle's muzzle pixels sit two rows over the shoulder at
   * known coordinates, and south/west mirror them column-for-column
   * (c -> 31 - c) — so the weapon provably rides the documented hand
   * anchor on every facing, for both builds. */
  const MUZZLE: Record<BodyBuildId, Array<[number, number]>> = {
    lean: [
      [26, 22],
      [27, 22],
    ],
    heavy: [
      [27, 22],
      [28, 22],
    ],
  };

  it("pins the rifle muzzle to fixed pixels on every facing", () => {
    for (const build of BODY_BUILD_IDS) {
      const character = armedCharacter("rifle", build);
      for (const facing of FACINGS) {
        const grid = composedCharacterGrid(character, facing, "idle", 0);
        const mirroredFacing = facing === "s" || facing === "w";
        for (const [x, y] of MUZZLE[build]) {
          const at = mirroredFacing ? BODY_FRAME.width - 1 - x : x;
          expect(
            grid[y]?.[at],
            `rifle ${build} ${facing} muzzle (${at}, ${y})`,
          ).toBe(MARKER);
        }
      }
    }
  });

  it("pins the blade guard beside the lean fist, toward camera", () => {
    const grid = composedCharacterGrid(armedCharacter("blade", "lean"), "e", "idle", 0);
    // Crossguard directly above the right hand window (cols 20-21, row 28).
    expect(grid[28]?.[21]).toBe(MARKER);
    expect(grid[28]?.[22]).toBe(MARKER);
    // The fist itself stays bare skin, gripping under the guard.
    for (const y of BODY_FRAME.hands.lean.rows) {
      for (const x of BODY_FRAME.hands.lean.right) {
        expect(["q", "r"], `hand pixel (${x}, ${y})`).toContain(grid[y]?.[x]);
      }
    }
  });
});

describe("per-facing draw order", () => {
  it("draws the rifle stock over the torso up front, occluded facing away", () => {
    const character = armedCharacter("rifle", "lean");
    // The stock crosses the body at (19, 29): weapon-over-body shows the
    // marker on front facings; the back order tucks it behind the hip.
    const front = composedCharacterGrid(character, "e", "idle", 0);
    expect(front[29]?.[19]).toBe(MARKER);
    const back = composedCharacterGrid(character, "n", "idle", 0);
    expect(back[29]?.[19]).not.toBe(MARKER);
    // Mirrored facings keep their order override.
    const south = composedCharacterGrid(character, "s", "idle", 0);
    expect(south[29]?.[BODY_FRAME.width - 1 - 19]).toBe(MARKER);
    const west = composedCharacterGrid(character, "w", "idle", 0);
    expect(west[29]?.[BODY_FRAME.width - 1 - 19]).not.toBe(MARKER);
  });

  it("keeps the protruding barrel visible even behind the body", () => {
    for (const build of BODY_BUILD_IDS) {
      const grid = composedCharacterGrid(
        armedCharacter("rifle", build),
        "n",
        "idle",
        0,
      );
      expect(pixelCells(grid, MARKER).length, build).toBeGreaterThan(4);
    }
  });
});

describe("weapons through the composed animation pipeline", () => {
  it("stays visible on every class, build, facing, state, and frame", () => {
    for (const id of WEAPON_CLASS_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const character = armedCharacter(id, build);
        for (const facing of FACINGS) {
          for (const state of STATES) {
            for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
              const grid = composedCharacterGrid(character, facing, state, f);
              const label = `${id} ${build} ${facing} ${state} ${f}`;
              expect(gridErrors(grid), label).toEqual([]);
              expect(pixelCells(grid, MARKER).length, label).toBeGreaterThan(2);
            }
          }
        }
      }
    }
  });
});
