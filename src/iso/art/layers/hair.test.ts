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
import {
  CRUSHED_HAIR_IDS,
  CRUSHED_HAIR_LAYERS,
  HAIR_LAYERS,
  HAIR_REGION,
  HAIR_STYLE_IDS,
  HAIR_TRAIL,
  hairWalkGrid,
  type HairStyleId,
} from "./hair";

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

describe("secondary motion (walk trail)", () => {
  const TRAILED = Object.keys(HAIR_TRAIL) as HairStyleId[];

  it("declares a trail for the long styles only, inside the head rows", () => {
    expect(TRAILED.sort()).toEqual(["locs", "ponytail"]);
    for (const style of TRAILED) {
      const trail = HAIR_TRAIL[style];
      expect(trail && trail.top).toBeGreaterThanOrEqual(HAIR_REGION.top);
      expect(trail && trail.bottom).toBe(HAIR_REGION.bottom);
    }
  });

  it("hairWalkGrid shifts exactly the trailing rows one pixel back, losing none", () => {
    for (const style of HAIR_STYLE_IDS) {
      for (const view of BODY_VIEW_IDS) {
        const grid = HAIR_LAYERS[style][view];
        const walked = hairWalkGrid(style, grid);
        const trail = HAIR_TRAIL[style];
        if (!trail) {
          expect(walked, `${style} ${view}`).toEqual(grid);
          continue;
        }
        grid.forEach((row, y) => {
          const label = `${style} ${view} row ${y}`;
          if (y < trail.top || y > trail.bottom) {
            expect(walked[y], label).toBe(row);
          } else {
            // Column 0 is always empty (HAIR_REGION), so a plain
            // left-shift with right-fill conserves every pixel.
            expect(row[0], label).toBe(".");
            expect(walked[y], label).toBe(`${row.slice(1)}.`);
          }
        });
      }
    }
  });

  it("trailing rows lag one pixel behind the head on every walk frame", () => {
    const inTrail = (style: HairStyleId, y: number): boolean => {
      const trail = HAIR_TRAIL[style];
      return trail !== undefined && y >= trail.top && y <= trail.bottom;
    };
    for (const style of HAIR_STYLE_IDS) {
      const character = hairCharacter(style, MARKER);
      // Facing east (authored view): trail is -x. Facing south
      // (mirrored): the trail flips with the frame to +x.
      for (const [facing, dx] of [["e", -1], ["s", 1]] as const) {
        const neutral = pixelCells(
          composedCharacterGrid(character, facing, "idle", 0),
          MARKER,
        );
        const contact = pixelCells(
          composedCharacterGrid(character, facing, "walk", 0),
          MARKER,
        );
        expect(contact, `${style} ${facing}`).toEqual(
          neutral.map(([x, y]) => [inTrail(style, y) ? x + dx : x, y]),
        );
      }
    }
  });
});

describe("frame bounds", () => {
  it("the mohawk crest rides every bob frame without clipping", () => {
    const character = hairCharacter("mohawk", MARKER);
    const authored = pixelCells(
      HAIR_LAYERS.mohawk.front,
      HAIR_CHANNEL,
    ).length;
    for (const state of STATES) {
      for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
        const grid = composedCharacterGrid(character, "e", state, f);
        const cells = pixelCells(grid, MARKER);
        // Nothing torn off the frame top by the lift/raise transforms.
        expect(cells.length, `${state} ${f}`).toBe(authored);
        for (const [, y] of cells) {
          expect(y, `${state} ${f}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
    // The walk high point lifts the crest to row 2 — still inside.
    const raised = pixelCells(
      composedCharacterGrid(character, "e", "walk", 2),
      MARKER,
    );
    expect(Math.min(...raised.map(([, y]) => y))).toBe(2);
  });

  it("the shaved glyph leaves the face-part cells clear", () => {
    const front = HAIR_LAYERS.glyph.front;
    const facePixels: ReadonlyArray<readonly [number, number]> = [
      // brows row 7 / eyes row 8 at cols 14–18, mouth row 12 at 15–17.
      ...[7, 8].flatMap((y) => [14, 15, 16, 17, 18].map((x) => [x, y] as const)),
      ...[15, 16, 17].map((x) => [x, 12] as const),
    ];
    for (const [x, y] of facePixels) {
      expect(front[y]?.[x], `col ${x} row ${y}`).toBe(".");
    }
  });
});

describe("crushed under-cap variants", () => {
  const CRUSHED_GRIDS = CRUSHED_HAIR_IDS.flatMap((id) =>
    BODY_VIEW_IDS.map((view) => ({
      label: `${id} ${view}`,
      grid: CRUSHED_HAIR_LAYERS[id][view],
    })),
  );

  it("every variant and view is a valid hair-channel frame grid", () => {
    for (const { label, grid } of CRUSHED_GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      const chars = new Set(grid.join("").replace(/\./g, ""));
      expect([...chars], label).toEqual([HAIR_CHANNEL]);
      expect(pixelCells(grid, HAIR_CHANNEL).length, label).toBeGreaterThan(5);
    }
  });

  it("stays inside the head region with the crown rows clear for headwear", () => {
    for (const { label, grid } of CRUSHED_GRIDS) {
      for (const [x, y] of pixelCells(grid, HAIR_CHANNEL)) {
        // Flattened hair starts below the brim line (row 7), so the
        // crushing headwear itself owns rows 3-6.
        expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(7);
        expect(y, `${label} row ${y}`).toBeLessThanOrEqual(HAIR_REGION.bottom);
        expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(HAIR_REGION.left);
        expect(x, `${label} col ${x}`).toBeLessThanOrEqual(HAIR_REGION.right);
      }
    }
  });

  it("variants are distinct from each other and from every resting style", () => {
    const keys = [...GRIDS, ...CRUSHED_GRIDS].map(({ grid }) => grid.join("\n"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("registers under the hair slot beside the styles, without trailing", () => {
    for (const id of CRUSHED_HAIR_IDS) {
      for (const view of BODY_VIEW_IDS) {
        expect(layerArtGrid("hair", id, view), `${id} ${view}`).toEqual(
          CRUSHED_HAIR_LAYERS[id][view],
        );
        // Pressed under headwear: no walk-trail secondary motion.
        expect(
          hairWalkGrid(id, CRUSHED_HAIR_LAYERS[id][view]),
          `${id} ${view}`,
        ).toEqual(CRUSHED_HAIR_LAYERS[id][view]);
      }
    }
  });

  it("every catalog style's crushed ref resolves to a registered hair layer", () => {
    for (const option of HAIR_STYLE_OPTIONS) {
      if (option.crushed === null) {
        // Only the shaved style has nothing to draw when crushed.
        expect(option.layer, option.id).toBeNull();
        continue;
      }
      for (const view of BODY_VIEW_IDS) {
        expect(
          layerArtGrid("hair", option.crushed, view),
          `${option.id} crushed ${view}`,
        ).not.toBeNull();
      }
    }
    // The shared variants are actually shared: style groups, not 1:1.
    const refs = HAIR_STYLE_OPTIONS.map((o) => o.crushed).filter(
      (c): c is string => c !== null,
    );
    expect(new Set(refs).size).toBeLessThan(refs.length);
  });

  it("rides the idle head bob through the composed pipeline", () => {
    for (const id of CRUSHED_HAIR_IDS) {
      const character = hairCharacter(id, MARKER);
      const authored = pixelCells(
        CRUSHED_HAIR_LAYERS[id].front,
        HAIR_CHANNEL,
      ).length;
      const neutral = pixelCells(
        composedCharacterGrid(character, "e", "idle", 0),
        MARKER,
      );
      const lifted = pixelCells(
        composedCharacterGrid(character, "e", "idle", 2),
        MARKER,
      );
      expect(neutral.length, id).toBe(authored);
      expect(lifted, id).toEqual(neutral.map(([x, y]) => [x, y - 1]));
    }
  });
});

describe("catalog and registry wiring", () => {
  it("registers every style under its catalog layer id", () => {
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
