import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../../animation";
import {
  composedCharacterGrid,
  layerArtGrid,
  type ComposedCharacter,
} from "../layers";
import { gridErrors, remapped, type PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_GRIDS,
  BODY_VIEW_IDS,
  type BodyBuildId,
} from "./body";
import {
  OUTFIT_GRIDS,
  OUTFIT_LAYER_IDS,
  OUTFIT_LAYERS,
  OUTFIT_REGION,
  outfitArtId,
} from "./outfits";

const STATES: MotionState[] = ["idle", "walk"];
const FACINGS: Facing[] = ["n", "e", "s", "w"];

/** The palette characters outfit layers may draw: the outfit primary
 * (V/W/X) and accent (l/j/k) remap channels plus outline and ink. */
const CHANNELS = ["0", "1", "V", "W", "X", "l", "j", "k"] as const;

/** The recolorable cloth channels (structure 0/1 stays authored). */
const CLOTH = ["V", "W", "X", "l", "j", "k"] as const;

/** Every (family, build, view, grid) tuple, labeled for assertions. */
const GRIDS = OUTFIT_LAYER_IDS.flatMap((id) =>
  BODY_BUILD_IDS.flatMap((build) =>
    BODY_VIEW_IDS.map((view) => ({
      id,
      build,
      view,
      label: `${id} ${build} ${view}`,
      grid: OUTFIT_LAYERS[id][build][view],
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

function opaqueCount(grid: PixelGrid): number {
  return grid.join("").replace(/\./g, "").length;
}

/* The body never uses synth-violet ("P"), so remapping every cloth
 * channel onto it makes outfit pixels uniquely countable in composed
 * frames — the same marker trick hair and headwear tests use. */
const MARKER = "P";
const markerRemap = Object.fromEntries(CLOTH.map((ch) => [ch, MARKER]));

/** A bare-build character wearing only the outfit, marker-remapped. */
function outfitCharacter(
  id: (typeof OUTFIT_LAYER_IDS)[number],
  build: BodyBuildId,
): ComposedCharacter {
  return {
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "outfit", art: outfitArtId(id, build), remap: markerRemap },
    ],
  };
}

describe("outfit layer grids", () => {
  it("every family, build, and view is a valid 32×48 frame grid", () => {
    for (const { label, grid } of GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, label).toBe(BODY_FRAME.width);
    }
  });

  it("draws only the outfit channels, and a real amount of pixels", () => {
    for (const { label, grid } of GRIDS) {
      const chars = [...new Set(grid.join("").replace(/\./g, ""))];
      for (const ch of chars) {
        expect(CHANNELS, `${label} draws "${ch}"`).toContain(ch);
      }
      expect(opaqueCount(grid), label).toBeGreaterThan(30);
    }
  });

  it("stays inside the outfit region (clear of head, legs, and shadow)", () => {
    for (const { label, grid } of GRIDS) {
      grid.forEach((row, y) => {
        [...row].forEach((c, x) => {
          if (c === ".") return;
          expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(
            OUTFIT_REGION.top,
          );
          expect(y, `${label} row ${y}`).toBeLessThanOrEqual(
            OUTFIT_REGION.bottom,
          );
          expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(
            OUTFIT_REGION.left,
          );
          expect(x, `${label} col ${x}`).toBeLessThanOrEqual(
            OUTFIT_REGION.right,
          );
        });
      });
    }
  });

  it("aligns to its build: pixels hug the body silhouette within one column", () => {
    for (const { build, view, label, grid } of GRIDS) {
      const body = BODY_GRIDS[build][view];
      grid.forEach((row, y) => {
        const cols = [...row]
          .map((c, x) => (c === "." ? -1 : x))
          .filter((x) => x >= 0);
        if (cols.length === 0) return;
        const bodyCols = [...(body[y] ?? "")]
          .map((c, x) => (c === "." ? -1 : x))
          .filter((x) => x >= 0);
        expect(bodyCols.length, `${label} row ${y} over bare body`).toBeGreaterThan(0);
        const left = Math.min(...bodyCols);
        const right = Math.max(...bodyCols);
        expect(Math.min(...cols), `${label} row ${y} left`).toBeGreaterThanOrEqual(
          left - 1,
        );
        expect(Math.max(...cols), `${label} row ${y} right`).toBeLessThanOrEqual(
          right + 1,
        );
      });
    }
  });

  it("leaves the bare-skin hand windows transparent on every build", () => {
    for (const { build, label, grid } of GRIDS) {
      const hands = BODY_FRAME.hands[build];
      for (const y of hands.rows) {
        for (const x of [...hands.left, ...hands.right]) {
          expect(grid[y]?.[x], `${label} hand pixel (${x}, ${y})`).toBe(".");
        }
      }
    }
  });

  it("families are distinct per build and view, and builds differ", () => {
    const keys = GRIDS.map(({ grid }) => grid.join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marker remaps recolor the cloth cleanly without losing pixels", () => {
    for (const { label, grid } of GRIDS) {
      const cloth = CLOTH.reduce(
        (n, ch) => n + pixelCells(grid, ch).length,
        0,
      );
      expect(cloth, `${label} has cloth pixels`).toBeGreaterThan(0);
      const marked = remapped(grid, markerRemap);
      expect(gridErrors(marked), label).toEqual([]);
      expect(pixelCells(marked, MARKER).length, label).toBe(cloth);
    }
  });
});

describe("registry wiring", () => {
  it("registers every family under its per-build art id", () => {
    for (const { id, build, view, label, grid } of GRIDS) {
      expect(layerArtGrid("outfit", outfitArtId(id, build), view), label).toEqual(
        grid,
      );
    }
    expect(Object.keys(OUTFIT_GRIDS).sort()).toEqual(
      OUTFIT_LAYER_IDS.flatMap((id) =>
        BODY_BUILD_IDS.map((build) => outfitArtId(id, build)),
      ).sort(),
    );
  });

  it("returns null for unknown families and builds", () => {
    expect(layerArtGrid("outfit", "tuxedo@lean", "front")).toBeNull();
    expect(layerArtGrid("outfit", outfitArtId("slicker", "lean"), "front"))
      .not.toBeNull();
    expect(layerArtGrid("outfit", "slicker", "front")).toBeNull();
  });
});

describe("outfits through the composed animation pipeline", () => {
  it("stays visible on every build, facing, state, and frame", () => {
    for (const id of OUTFIT_LAYER_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const character = outfitCharacter(id, build);
        for (const facing of FACINGS) {
          for (const state of STATES) {
            for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
              const grid = composedCharacterGrid(character, facing, state, f);
              expect(gridErrors(grid), `${id} ${build} ${facing} ${state} ${f}`).toEqual(
                [],
              );
              expect(
                pixelCells(grid, MARKER).length,
                `${id} ${build} ${facing} ${state} ${f}`,
              ).toBeGreaterThan(20);
            }
          }
        }
      }
    }
  });

  it("keeps the hands bare on the neutral pose for every family", () => {
    for (const id of OUTFIT_LAYER_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const grid = composedCharacterGrid(
          outfitCharacter(id, build),
          "e",
          "idle",
          0,
        );
        const hands = BODY_FRAME.hands[build];
        for (const y of hands.rows) {
          for (const x of [...hands.left, ...hands.right]) {
            expect(
              ["q", "r"],
              `${id} ${build} hand pixel (${x}, ${y})`,
            ).toContain(grid[y]?.[x]);
          }
        }
      }
    }
  });

  it("reads differently from the bare body on both authored views", () => {
    for (const id of OUTFIT_LAYER_IDS) {
      for (const build of BODY_BUILD_IDS) {
        const bare: ComposedCharacter = {
          build,
          layers: [{ slot: "body", art: build, remap: {} }],
        };
        for (const facing of ["e", "n"] as const) {
          expect(
            composedCharacterGrid(outfitCharacter(id, build), facing, "idle", 0),
            `${id} ${build} ${facing}`,
          ).not.toEqual(composedCharacterGrid(bare, facing, "idle", 0));
        }
      }
    }
  });
});
