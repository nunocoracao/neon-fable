import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../../animation";
import { HEADWEAR_OPTIONS } from "../../../data/appearance";
import {
  composedCharacterGrid,
  layerArtGrid,
  type ComposedCharacter,
} from "../layers";
import { gridErrors, remapped, type PixelGrid } from "../pixel";
import { BODY_FRAME, BODY_VIEW_IDS } from "./body";
import { FACE_LAYERS, FACE_PART_IDS } from "./face";
import {
  HEADWEAR_IDS,
  HEADWEAR_LAYERS,
  HEADWEAR_PORTRAITS,
  HEADWEAR_REGION,
  type HeadwearId,
} from "./headwear";

const STATES: MotionState[] = ["idle", "walk"];
const FACINGS: Facing[] = ["n", "e", "s", "w"];

/** The palette characters each option may draw, per the module contract. */
const CHANNELS: Readonly<Record<HeadwearId, readonly string[]>> = {
  cap: ["Y", "Z", "n"],
  hood: ["V", "W", "X"],
  visor: ["6", "T", "9", "f", "U", "h"],
  rebreather: ["6", "T", "9", "f", "U", "h", "1"],
};

/** Every (option, view, grid) triple, labeled for assertion messages. */
const GRIDS = HEADWEAR_IDS.flatMap((id) =>
  BODY_VIEW_IDS.map((view) => ({
    id,
    view,
    label: `${id} ${view}`,
    grid: HEADWEAR_LAYERS[id][view],
  })),
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

/* The body never uses synth-violet ("P"), so remapping every headwear
 * channel onto it makes headwear pixels uniquely countable in composed
 * frames — the same marker trick hair.test.ts uses. */
const MARKER = "P";

function markerRemap(id: HeadwearId): Record<string, string> {
  return Object.fromEntries(CHANNELS[id].map((ch) => [ch, MARKER]));
}

/** A lean character wearing only the option, marker-remapped. */
function headwearCharacter(id: HeadwearId): ComposedCharacter {
  return {
    build: "lean",
    layers: [
      { slot: "body", art: "lean", remap: {} },
      { slot: "headwear", art: id, remap: markerRemap(id) },
    ],
  };
}

describe("headwear layer grids", () => {
  it("every option and view is a valid 32×48 frame grid", () => {
    for (const { label, grid } of GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, label).toBe(BODY_FRAME.width);
    }
  });

  it("draws only its declared channels, and a real amount of pixels", () => {
    for (const { id, label, grid } of GRIDS) {
      const chars = [...new Set(grid.join("").replace(/\./g, ""))];
      for (const ch of chars) {
        expect(CHANNELS[id], `${label} draws "${ch}"`).toContain(ch);
      }
      const count = chars.reduce(
        (n, ch) => n + pixelCells(grid, ch).length,
        0,
      );
      expect(count, label).toBeGreaterThan(15);
    }
  });

  it("stays inside the head region (no stray body pixels)", () => {
    for (const { label, grid } of GRIDS) {
      grid.forEach((row, y) => {
        [...row].forEach((c, x) => {
          if (c === ".") return;
          expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(
            HEADWEAR_REGION.top,
          );
          expect(y, `${label} row ${y}`).toBeLessThanOrEqual(
            HEADWEAR_REGION.bottom,
          );
          expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(
            HEADWEAR_REGION.left,
          );
          expect(x, `${label} col ${x}`).toBeLessThanOrEqual(
            HEADWEAR_REGION.right,
          );
        });
      });
    }
  });

  it("options are distinct per view and front differs from back", () => {
    const keys = GRIDS.map(({ grid }) => grid.join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("marker remaps recolor cleanly without losing pixels", () => {
    for (const { id, label, grid } of GRIDS) {
      const total = grid.join("").replace(/\./g, "").length;
      const marked = remapped(grid, markerRemap(id));
      expect(gridErrors(marked), label).toEqual([]);
      expect(pixelCells(marked, MARKER).length, label).toBe(total);
    }
  });
});

describe("eye coverage", () => {
  it("coversEyes options blank every authored eye pixel up front", () => {
    const covering = HEADWEAR_OPTIONS.filter((o) => o.coversEyes);
    expect(covering.map((o) => o.id).sort()).toEqual(["rebreather", "visor"]);
    for (const option of covering) {
      const front = HEADWEAR_LAYERS[option.layer as HeadwearId].front;
      for (const eyes of FACE_PART_IDS.eyes) {
        const eyeGrid = FACE_LAYERS[eyes].front;
        eyeGrid.forEach((row, y) => {
          [...row].forEach((c, x) => {
            if (c === ".") return;
            expect(
              front[y]?.[x],
              `${option.id} leaves ${eyes} pixel (${x}, ${y}) uncovered`,
            ).not.toBe(".");
          });
        });
      }
    }
  });
});

describe("catalog and registry wiring", () => {
  it("registers every drawn catalog option under its layer id", () => {
    const drawn = HEADWEAR_OPTIONS.filter((o) => o.layer !== null);
    expect(drawn.map((o) => o.layer).sort()).toEqual([...HEADWEAR_IDS].sort());
    for (const option of drawn) {
      for (const view of BODY_VIEW_IDS) {
        expect(
          layerArtGrid("headwear", option.layer ?? "", view),
          `${option.id} ${view}`,
        ).toEqual(HEADWEAR_LAYERS[option.layer as HeadwearId][view]);
      }
    }
  });
});

describe("headwear through the composed animation pipeline", () => {
  it("keeps every pixel through every facing, state, and frame", () => {
    for (const id of HEADWEAR_IDS) {
      const character = headwearCharacter(id);
      for (const facing of FACINGS) {
        const view = facing === "e" || facing === "s" ? "front" : "back";
        const authored = HEADWEAR_LAYERS[id][view]
          .join("")
          .replace(/\./g, "").length;
        for (const state of STATES) {
          for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
            const grid = composedCharacterGrid(character, facing, state, f);
            expect(
              pixelCells(grid, MARKER).length,
              `${id} ${facing} ${state} ${f}`,
            ).toBe(authored);
          }
        }
      }
    }
  });

  it("tracks the 1px idle head bob: the lift frame shifts headwear up one row", () => {
    for (const id of HEADWEAR_IDS) {
      const character = headwearCharacter(id);
      const neutral = pixelCells(
        composedCharacterGrid(character, "e", "idle", 0),
        MARKER,
      );
      const lifted = pixelCells(
        composedCharacterGrid(character, "e", "idle", 2),
        MARKER,
      );
      expect(lifted, id).toEqual(neutral.map(([x, y]) => [x, y - 1]));
    }
  });

  it("tracks the walk bob: recoil sinks headwear one row, passing lifts it", () => {
    for (const id of HEADWEAR_IDS) {
      const character = headwearCharacter(id);
      const contact = pixelCells(
        composedCharacterGrid(character, "e", "walk", 0),
        MARKER,
      );
      const sunk = pixelCells(
        composedCharacterGrid(character, "e", "walk", 1),
        MARKER,
      );
      const raised = pixelCells(
        composedCharacterGrid(character, "e", "walk", 2),
        MARKER,
      );
      expect(sunk, id).toEqual(contact.map(([x, y]) => [x, y + 1]));
      expect(raised, id).toEqual(contact.map(([x, y]) => [x, y - 1]));
    }
  });

  it("draws above the hair layer on every facing", () => {
    // A cap over the buzz crop: where both are opaque, the cap wins.
    const character: ComposedCharacter = {
      build: "lean",
      layers: [
        { slot: "body", art: "lean", remap: {} },
        { slot: "hair", art: "buzz", remap: {} },
        { slot: "headwear", art: "cap", remap: markerRemap("cap") },
      ],
    };
    for (const facing of FACINGS) {
      const view = facing === "e" || facing === "s" ? "front" : "back";
      const authored = HEADWEAR_LAYERS.cap[view]
        .join("")
        .replace(/\./g, "").length;
      const grid = composedCharacterGrid(character, facing, "idle", 0);
      expect(pixelCells(grid, MARKER).length, facing).toBe(authored);
    }
  });
});

describe("portrait art", () => {
  it("every option carries a valid 16×12 portrait overlay", () => {
    for (const id of HEADWEAR_IDS) {
      const portrait = HEADWEAR_PORTRAITS[id];
      expect(gridErrors(portrait), id).toEqual([]);
      expect(portrait.length, id).toBe(12);
      for (const row of portrait) {
        expect(row.length, id).toBe(16);
      }
    }
  });

  it("portraits are distinct and stay in their sprite channels", () => {
    const keys = HEADWEAR_IDS.map((id) => HEADWEAR_PORTRAITS[id].join("\n"));
    expect(new Set(keys).size).toBe(HEADWEAR_IDS.length);
    for (const id of HEADWEAR_IDS) {
      const chars = new Set(
        HEADWEAR_PORTRAITS[id].join("").replace(/\./g, ""),
      );
      for (const ch of chars) {
        expect(CHANNELS[id], `${id} portrait draws "${ch}"`).toContain(ch);
      }
    }
  });

  it("lens portraits dither translucent: glass rows keep transparent gaps", () => {
    // The visor band (rows 3-4) and the rebreather lenses (rows 2-3)
    // mix glass pixels with gaps, so composed eyes read through.
    for (const [id, rows] of [
      ["visor", [3, 4]],
      ["rebreather", [2, 3]],
    ] as const) {
      const band = rows.map((y) => HEADWEAR_PORTRAITS[id][y] ?? "").join("");
      expect(band, id).toMatch(/[fUh]/);
      // Gaps inside the band interior, not just the margins.
      expect(band.replace(/^\.+|\.+$/g, ""), id).toMatch(/\./);
    }
  });
});
