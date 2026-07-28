import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../../animation";
import { HAIR_STYLE_OPTIONS } from "../../../data/appearance";
import {
  composedCharacterGrid,
  layerArtGrid,
  type ComposedCharacter,
} from "../layers";
import { HAIR_COLORS, REMAP_CHANNELS } from "../palette";
import { gridErrors, remapped, type PixelGrid } from "../pixel";
import { BODY_FRAME, BODY_VIEW_IDS } from "./body";
import { HAIR_LAYERS, HAIR_REGION, HAIR_STYLE_IDS } from "./hair";

const [HAIR_CHANNEL = "K"] = REMAP_CHANNELS.hair;
const STATES: MotionState[] = ["idle", "walk"];

/** Every (style, view, grid) triple, labeled for assertion messages. */
const GRIDS = HAIR_STYLE_IDS.flatMap((style) =>
  BODY_VIEW_IDS.map((view) => ({
    label: `${style} ${view}`,
    grid: HAIR_LAYERS[style][view],
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

/** A lean character wearing the style, hair remapped to a marker color. */
function hairCharacter(style: string, color: string): ComposedCharacter {
  return {
    build: "lean",
    layers: [
      { slot: "body", art: "lean", remap: {} },
      { slot: "hair", art: style, remap: { [HAIR_CHANNEL]: color } },
    ],
  };
}

/* The body never uses synth-violet ("P"), so remapping hair onto it
 * makes hair pixels uniquely countable in composed frames. */
const MARKER = "P";

describe("hair layer grids", () => {
  it("every style and view is a valid 32×48 frame grid", () => {
    for (const { label, grid } of GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, label).toBe(BODY_FRAME.width);
    }
  });

  it("draws only hair-channel pixels, and a real amount of them", () => {
    for (const { label, grid } of GRIDS) {
      const chars = new Set(grid.join("").replace(/\./g, ""));
      expect([...chars], label).toEqual([HAIR_CHANNEL]);
      expect(pixelCells(grid, HAIR_CHANNEL).length, label).toBeGreaterThan(15);
    }
  });

  it("stays inside the head region (no stray body pixels)", () => {
    for (const { label, grid } of GRIDS) {
      for (const [x, y] of pixelCells(grid, HAIR_CHANNEL)) {
        expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(HAIR_REGION.top);
        expect(y, `${label} row ${y}`).toBeLessThanOrEqual(HAIR_REGION.bottom);
        expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(HAIR_REGION.left);
        expect(x, `${label} col ${x}`).toBeLessThanOrEqual(HAIR_REGION.right);
      }
    }
  });

  it("styles are distinct per view and front differs from back", () => {
    const keys = GRIDS.map(({ grid }) => grid.join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("recolors cleanly through every palette hair color", () => {
    expect(HAIR_COLORS.length).toBe(6);
    for (const { label, grid } of GRIDS) {
      const count = pixelCells(grid, HAIR_CHANNEL).length;
      for (const color of HAIR_COLORS) {
        const recolored = remapped(grid, { [HAIR_CHANNEL]: color });
        expect(gridErrors(recolored), `${label} -> ${color}`).toEqual([]);
        expect(
          pixelCells(recolored, color).length,
          `${label} -> ${color}`,
        ).toBe(count);
      }
    }
  });
});

describe("catalog and registry wiring", () => {
  it("registers every set-1 style under its catalog layer id", () => {
    for (const style of HAIR_STYLE_IDS) {
      const option = HAIR_STYLE_OPTIONS.find((o) => o.layer === style);
      expect(option, style).toBeDefined();
      expect(option?.label, style).toBeTruthy();
      for (const view of BODY_VIEW_IDS) {
        expect(layerArtGrid("hair", style, view), `${style} ${view}`).toEqual(
          HAIR_LAYERS[style][view],
        );
      }
    }
  });
});

describe("hair through the composed animation pipeline", () => {
  const FACINGS: Facing[] = ["n", "e", "s", "w"];

  it("keeps every hair pixel through every facing, state, and frame", () => {
    for (const style of HAIR_STYLE_IDS) {
      const character = hairCharacter(style, MARKER);
      for (const facing of FACINGS) {
        const view = facing === "e" || facing === "s" ? "front" : "back";
        const authored = pixelCells(HAIR_LAYERS[style][view], HAIR_CHANNEL)
          .length;
        for (const state of STATES) {
          for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
            const grid = composedCharacterGrid(character, facing, state, f);
            expect(
              pixelCells(grid, MARKER).length,
              `${style} ${facing} ${state} ${f}`,
            ).toBe(authored);
          }
        }
      }
    }
  });

  it("tracks the 1px idle head bob: the lift frame shifts hair up one row", () => {
    for (const style of HAIR_STYLE_IDS) {
      const character = hairCharacter(style, MARKER);
      const neutral = pixelCells(
        composedCharacterGrid(character, "e", "idle", 0),
        MARKER,
      );
      const lifted = pixelCells(
        composedCharacterGrid(character, "e", "idle", 2),
        MARKER,
      );
      expect(lifted, style).toEqual(neutral.map(([x, y]) => [x, y - 1]));
    }
  });

  it("tracks the walk bob: recoil sinks hair one row, passing lifts it", () => {
    for (const style of HAIR_STYLE_IDS) {
      const character = hairCharacter(style, MARKER);
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
      expect(sunk, style).toEqual(contact.map(([x, y]) => [x, y + 1]));
      expect(raised, style).toEqual(contact.map(([x, y]) => [x, y - 1]));
    }
  });
});
