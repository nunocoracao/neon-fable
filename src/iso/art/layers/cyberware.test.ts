import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../../animation";
import {
  composedCharacterGrid,
  layerArtGrid,
  type ComposedCharacter,
} from "../layers";
import { MATERIAL_RAMPS } from "../palette";
import { gridErrors, remapped, type PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  BODY_VIEW_IDS,
  type BodyBuildId,
} from "./body";
import {
  CYBER_GRIDS,
  CYBER_LAYERS,
  CYBER_LAYER_IDS,
  CYBER_LAYER_TRAITS,
  CYBER_PORTRAITS,
  CYBER_REGION,
  cyberArtId,
  cyberPulseFrames,
  type CyberLayerId,
} from "./cyberware";

const STATES: MotionState[] = ["idle", "walk"];
const FACINGS: Facing[] = ["n", "e", "s", "w"];

/** The palette characters cyberware layers may draw: chrome plating
 * (6/T/9), the neon-glow accent channel (l/j/k), and outline/ink. */
const CHANNELS = ["0", "1", "6", "T", "9", "l", "j", "k"] as const;

/** Every (family, build, view, grid) tuple, labeled for assertions. */
const GRIDS = CYBER_LAYER_IDS.flatMap((id) =>
  BODY_BUILD_IDS.flatMap((build) =>
    BODY_VIEW_IDS.map((view) => ({
      id,
      build,
      view,
      label: `${id} ${build} ${view}`,
      grid: CYBER_LAYERS[id][build][view],
    })),
  ),
);

function opaqueCells(grid: PixelGrid): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c !== ".") cells.push([x, y]);
    });
  });
  return cells;
}

function pixelCells(grid: PixelGrid, ch: string): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  grid.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === ch) cells.push([x, y]);
    });
  });
  return cells;
}

/* The body never uses synth-violet ("P"), so remapping every cyberware
 * channel onto it makes overlay pixels uniquely countable in composed
 * frames — the same marker trick the other layer tests use. */
const MARKER = "P";
const markerRemap = Object.fromEntries(CHANNELS.map((ch) => [ch, MARKER]));

/** A bare-build character wearing only the overlay, marker-remapped. */
function chromed(id: CyberLayerId, build: BodyBuildId): ComposedCharacter {
  return {
    build,
    layers: [
      { slot: "body", art: build, remap: {} },
      { slot: "cyberware", art: cyberArtId(id, build), remap: markerRemap },
    ],
  };
}

describe("cyberware layer grids", () => {
  it("every family, build, and view is a valid 32×48 frame grid", () => {
    for (const { label, grid } of GRIDS) {
      expect(gridErrors(grid), label).toEqual([]);
      expect(grid.length, label).toBe(BODY_FRAME.height);
      expect(grid[0]?.length, label).toBe(BODY_FRAME.width);
    }
  });

  it("draws only the cyberware channels, and every front view a real amount", () => {
    for (const { view, label, grid } of GRIDS) {
      const chars = [...new Set(grid.join("").replace(/\./g, ""))];
      for (const ch of chars) {
        expect(CHANNELS, `${label} draws "${ch}"`).toContain(ch);
      }
      if (view === "front") {
        expect(opaqueCells(grid).length, label).toBeGreaterThan(4);
      }
    }
  });

  it("stays inside the cyber region (head box through the hand rows)", () => {
    for (const { label, grid } of GRIDS) {
      for (const [x, y] of opaqueCells(grid)) {
        expect(y, `${label} row ${y}`).toBeGreaterThanOrEqual(CYBER_REGION.top);
        expect(y, `${label} row ${y}`).toBeLessThanOrEqual(CYBER_REGION.bottom);
        expect(x, `${label} col ${x}`).toBeGreaterThanOrEqual(CYBER_REGION.left);
        expect(x, `${label} col ${x}`).toBeLessThanOrEqual(CYBER_REGION.right);
      }
    }
  });

  it("shifting families track the heavy build; head families share grids", () => {
    const dx =
      BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0];
    for (const id of CYBER_LAYER_IDS) {
      for (const view of BODY_VIEW_IDS) {
        const lean = opaqueCells(CYBER_LAYERS[id]["lean"][view]);
        const heavy = opaqueCells(CYBER_LAYERS[id]["heavy"][view]);
        if (CYBER_LAYER_TRAITS[id].shifts) {
          expect(heavy, `${id} ${view} heavy = lean + ${dx} cols`).toEqual(
            lean.map(([x, y]) => [x + dx, y]),
          );
        } else {
          expect(
            CYBER_LAYERS[id]["heavy"][view],
            `${id} ${view} shared across builds`,
          ).toEqual(CYBER_LAYERS[id]["lean"][view]);
        }
      }
    }
  });

  it("families read distinct on the front view, per build", () => {
    for (const build of BODY_BUILD_IDS) {
      const keys = CYBER_LAYER_IDS.map((id) =>
        CYBER_LAYERS[id][build]["front"].join("\n"),
      );
      expect(new Set(keys).size, build).toBe(keys.length);
    }
  });

  it("the optic glow sits on the eye rows only, and is front-only", () => {
    for (const build of BODY_BUILD_IDS) {
      for (const [x, y] of opaqueCells(CYBER_LAYERS.optics[build]["front"])) {
        expect(y, `optics row ${y}`).toBeGreaterThanOrEqual(8);
        expect(y, `optics row ${y}`).toBeLessThanOrEqual(9);
        expect(x).toBeGreaterThanOrEqual(BODY_FRAME.head.left);
        expect(x).toBeLessThanOrEqual(BODY_FRAME.head.right);
      }
      expect(opaqueCells(CYBER_LAYERS.optics[build]["back"])).toEqual([]);
    }
    expect(CYBER_LAYER_TRAITS.optics.eyeRegion).toBe(true);
    // No other family claims the eye-cover interaction.
    for (const id of CYBER_LAYER_IDS) {
      if (id !== "optics") {
        expect(CYBER_LAYER_TRAITS[id].eyeRegion, id).toBe(false);
      }
    }
  });

  it("the chrome arm replaces the leading hand's skin pixels on both builds", () => {
    for (const build of BODY_BUILD_IDS) {
      const grid = CYBER_LAYERS["chrome-arm"][build]["front"];
      const hands = BODY_FRAME.hands[build];
      for (const y of hands.rows) {
        for (const x of hands.right) {
          expect(grid[y]?.[x], `${build} hand pixel (${x}, ${y})`).not.toBe(".");
        }
      }
    }
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

describe("cyberPulseFrames", () => {
  it("is a deterministic 2-frame pulse covering the whole glow channel", () => {
    for (const accent of [undefined, "neonCyan", "hazardAmber"] as const) {
      const frames = cyberPulseFrames(accent);
      expect(frames, String(accent)).toEqual(cyberPulseFrames(accent));
      expect(frames).toHaveLength(2);
      for (const frame of frames) {
        expect(Object.keys(frame).sort()).toEqual(["j", "k", "l"]);
      }
      // The dim and flare frames genuinely differ.
      expect(frames[0]).not.toEqual(frames[1]);
    }
  });

  it("sinks to the accent ramp's shade and flares to its highlight", () => {
    const cyan = MATERIAL_RAMPS.neonCyan;
    expect(cyberPulseFrames("neonCyan")).toEqual([
      { l: cyan.shade, j: cyan.shade, k: cyan.base },
      { l: cyan.shade, j: cyan.highlight, k: cyan.highlight },
    ]);
    // No accent pulses the authored magenta channel over itself.
    expect(cyberPulseFrames()).toEqual([
      { l: "l", j: "l", k: "j" },
      { l: "l", j: "k", k: "k" },
    ]);
  });
});

describe("registry wiring", () => {
  it("registers every family under its per-build art id", () => {
    for (const { id, build, view, label, grid } of GRIDS) {
      expect(
        layerArtGrid("cyberware", cyberArtId(id, build), view),
        label,
      ).toEqual(grid);
    }
    expect(Object.keys(CYBER_GRIDS).sort()).toEqual(
      CYBER_LAYER_IDS.flatMap((id) =>
        BODY_BUILD_IDS.map((build) => cyberArtId(id, build)),
      ).sort(),
    );
  });

  it("returns null for unknown families, bare item ids, and bare family ids", () => {
    expect(layerArtGrid("cyberware", "wetware@lean", "front")).toBeNull();
    expect(layerArtGrid("cyberware", "cyb-optic-suite", "front")).toBeNull();
    expect(layerArtGrid("cyberware", "optics", "front")).toBeNull();
    expect(
      layerArtGrid("cyberware", cyberArtId("optics", "lean"), "front"),
    ).not.toBeNull();
  });
});

describe("cyberware through the composed animation pipeline", () => {
  it("stays visible on every family, build, facing, state, and frame", () => {
    for (const id of CYBER_LAYER_IDS) {
      // The optics glow is front-only; back facings draw nothing.
      const facings =
        id === "optics" ? FACINGS.filter((f) => f === "e" || f === "s") : FACINGS;
      for (const build of BODY_BUILD_IDS) {
        const character = chromed(id, build);
        for (const facing of facings) {
          for (const state of STATES) {
            for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
              const grid = composedCharacterGrid(character, facing, state, f);
              const label = `${id} ${build} ${facing} ${state} ${f}`;
              expect(gridErrors(grid), label).toEqual([]);
              expect(pixelCells(grid, MARKER).length, label).toBeGreaterThan(1);
            }
          }
        }
      }
    }
  });

  it("multiple overlays compose together without losing any family", () => {
    for (const build of BODY_BUILD_IDS) {
      const character: ComposedCharacter = {
        build,
        layers: [
          { slot: "body", art: build, remap: {} },
          ...(["optics", "chrome-arm", "neural-jack"] as const).map((id) => ({
            slot: "cyberware" as const,
            art: cyberArtId(id, build),
            remap: markerRemap,
          })),
        ],
      };
      const grid = composedCharacterGrid(character, "e", "idle", 0);
      expect(gridErrors(grid), build).toEqual([]);
      const together = pixelCells(grid, MARKER).length;
      // At least as many marker pixels as the largest single overlay —
      // the three never fully occlude one another.
      const alone = (["optics", "chrome-arm", "neural-jack"] as const).map(
        (id) =>
          pixelCells(
            composedCharacterGrid(chromed(id, build), "e", "idle", 0),
            MARKER,
          ).length,
      );
      expect(together, build).toBeGreaterThanOrEqual(
        alone.reduce((a, b) => a + b, 0) - 2,
      );
    }
  });
});

describe("portrait overlays", () => {
  it("covers the head-region families with valid 16-wide face-box grids", () => {
    expect(Object.keys(CYBER_PORTRAITS).sort()).toEqual(
      ["neural-jack", "optics", "veil-film"].sort(),
    );
    for (const [id, grid] of Object.entries(CYBER_PORTRAITS)) {
      expect(gridErrors(grid), id).toEqual([]);
      expect(grid.length, id).toBe(12);
      expect(grid[0]?.length, id).toBe(16);
      expect(opaqueCells(grid).length, id).toBeGreaterThan(2);
    }
    // The optic portrait keeps its glow in the accent channel so the
    // item recolor (and the portrait renderer's remap) applies.
    const optics = CYBER_PORTRAITS.optics ?? [];
    expect(pixelCells(optics, "j").length + pixelCells(optics, "k").length)
      .toBeGreaterThan(4);
  });
});
