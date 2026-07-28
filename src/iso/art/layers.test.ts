import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../animation";
import {
  appearanceKey,
  composeGrids,
  composedFrameGrid,
  composedFrameKey,
  eyeColorRemap,
  layerOrderFor,
  orderedLayerParts,
  previewAppearance,
  skinToneRemap,
  type ComposedAppearance,
  type LayerPart,
  type LayerSlot,
} from "./layers";
import { BODY_FRAME } from "./layers/body";
import { SKIN_RAMPS } from "./palette";
import { gridErrors, mirrored, type PixelGrid } from "./pixel";

const { width: W, height: H } = BODY_FRAME;
const BLANK = ".".repeat(W);
const FACINGS: Facing[] = ["n", "e", "s", "w"];
const STATES: MotionState[] = ["idle", "walk"];

/** A frame-sized grid with the given (x, y, char) pixels set. */
function frameGrid(
  cells: ReadonlyArray<readonly [number, number, string]>,
): string[] {
  const rows = Array.from({ length: H }, () => BLANK);
  for (const [x, y, ch] of cells) {
    const row = rows[y] ?? BLANK;
    rows[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }
  return rows;
}

function countChar(grid: PixelGrid, ch: string): number {
  return grid.reduce(
    (n, row) => n + [...row].filter((c) => c === ch).length,
    0,
  );
}

const APPEARANCE: ComposedAppearance = {
  build: "lean",
  skinTone: 0,
  eyeColor: "g",
  face: "stub",
};

describe("composeGrids", () => {
  it("lets later layers override earlier ones where both are opaque", () => {
    const lower = frameGrid([
      [5, 5, "1"],
      [6, 5, "2"],
    ]);
    const upper = frameGrid([[5, 5, "3"]]);
    const out = composeGrids([{ grid: lower }, { grid: upper }]);
    expect(out[5]?.[5]).toBe("3");
    expect(out[5]?.[6]).toBe("2");
  });

  it("lets transparent pixels fall through to lower layers", () => {
    const lower = frameGrid([[10, 10, "7"]]);
    const upper = frameGrid([[11, 10, "8"]]);
    const out = composeGrids([{ grid: lower }, { grid: upper }]);
    expect(out[10]?.[10]).toBe("7");
    expect(out[10]?.[11]).toBe("8");
  });

  it("applies each layer's remap before compositing, scoped to that layer", () => {
    const skinned = frameGrid([[1, 1, "q"]]);
    const plain = frameGrid([[2, 1, "q"]]);
    const out = composeGrids([
      { grid: skinned, remap: { q: "B" } },
      { grid: plain },
    ]);
    expect(out[1]?.[1]).toBe("B");
    expect(out[1]?.[2]).toBe("q");
  });

  it("throws on an empty layer list", () => {
    expect(() => composeGrids([])).toThrow(/at least one layer/);
  });

  it("throws when a layer has the wrong row count", () => {
    const short = frameGrid([]).slice(0, H - 1);
    expect(() => composeGrids([{ grid: short }])).toThrow(/rows, expected 48/);
  });

  it("throws when a layer row has the wrong width", () => {
    const ragged = frameGrid([]);
    ragged[7] = BLANK.slice(1);
    expect(() => composeGrids([{ grid: ragged }])).toThrow(
      /width 31, expected 32/,
    );
  });
});

describe("per-facing layer order", () => {
  it("draws the weapon over the body toward camera, behind it facing away", () => {
    for (const facing of FACINGS) {
      const order = layerOrderFor(facing);
      expect(new Set(order).size, facing).toBe(7);
      const weaponAbove = order.indexOf("weapon") > order.indexOf("body");
      expect(weaponAbove, facing).toBe(facing === "e" || facing === "s");
      // Cyberware overlays always draw on top.
      expect(order[order.length - 1], facing).toBe("cyberware");
    }
  });

  it("orders parts per facing and skips absent slots", () => {
    const parts: Partial<Record<LayerSlot, LayerPart>> = {
      weapon: { grid: frameGrid([[3, 30, "9"]]) },
      body: { grid: frameGrid([[3, 30, "1"]]) },
    };
    const front = composeGrids(orderedLayerParts(parts, "e"));
    const back = composeGrids(orderedLayerParts(parts, "n"));
    expect(front[30]?.[3]).toBe("9");
    expect(back[30]?.[3]).toBe("1");
    expect(orderedLayerParts(parts, "e")).toHaveLength(2);
  });
});

describe("channel remaps", () => {
  it("maps the canonical skin channel onto each ramp", () => {
    expect(skinToneRemap(0)).toEqual({ r: "r", q: "q", A: "A" });
    expect(skinToneRemap(2)).toEqual({ r: "F", q: "E", A: "G" });
  });

  it("rejects out-of-range skin tones", () => {
    expect(() => skinToneRemap(-1)).toThrow(/out of range/);
    expect(() => skinToneRemap(SKIN_RAMPS.length)).toThrow(/out of range/);
  });

  it("maps the iris channel to any palette entry and rejects others", () => {
    expect(eyeColorRemap("m")).toEqual({ g: "m" });
    expect(() => eyeColorRemap("?")).toThrow(/not a palette entry/);
    expect(() => eyeColorRemap(".")).toThrow(/not a palette entry/);
  });
});

describe("appearance and frame keys", () => {
  it("serializes every field so equal descriptors share a key", () => {
    const reordered: ComposedAppearance = {
      face: "stub",
      eyeColor: "g",
      skinTone: 0,
      build: "lean",
    };
    expect(appearanceKey(reordered)).toBe(appearanceKey(APPEARANCE));
  });

  it("changes when any field changes", () => {
    const variants: ComposedAppearance[] = [
      APPEARANCE,
      { ...APPEARANCE, build: "heavy" },
      { ...APPEARANCE, skinTone: 3 },
      { ...APPEARANCE, eyeColor: "m" },
      { ...APPEARANCE, face: null },
    ];
    expect(new Set(variants.map(appearanceKey)).size).toBe(variants.length);
  });

  it("frame keys are stable and distinct per facing, state, and frame", () => {
    expect(composedFrameKey(APPEARANCE, "e", "walk", 3)).toBe(
      composedFrameKey(APPEARANCE, "e", "walk", 3),
    );
    const keys = [
      composedFrameKey(APPEARANCE, "e", "walk", 3),
      composedFrameKey(APPEARANCE, "s", "walk", 3),
      composedFrameKey(APPEARANCE, "e", "idle", 3),
      composedFrameKey(APPEARANCE, "e", "walk", 4),
      composedFrameKey({ ...APPEARANCE, skinTone: 1 }, "e", "walk", 3),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("composedFrameGrid", () => {
  it("returns valid 32×48 grids for every facing, state, and frame", () => {
    for (const facing of FACINGS) {
      for (const state of STATES) {
        for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
          const grid = composedFrameGrid(APPEARANCE, facing, state, f);
          expect(gridErrors(grid), `${facing} ${state} ${f}`).toEqual([]);
          expect(grid.length, `${facing} ${state} ${f}`).toBe(H);
          expect(grid[0]?.length, `${facing} ${state} ${f}`).toBe(W);
        }
      }
    }
  });

  it("draws the stub face on front views only", () => {
    expect(countChar(composedFrameGrid(APPEARANCE, "e", "idle", 0), "g")).toBe(4);
    expect(countChar(composedFrameGrid(APPEARANCE, "n", "idle", 0), "g")).toBe(0);
  });

  it("mirrors south/west from the authored views", () => {
    expect(composedFrameGrid(APPEARANCE, "s", "walk", 2)).toEqual(
      mirrored(composedFrameGrid(APPEARANCE, "e", "walk", 2)),
    );
    expect(composedFrameGrid(APPEARANCE, "w", "idle", 1)).toEqual(
      mirrored(composedFrameGrid(APPEARANCE, "n", "idle", 1)),
    );
  });

  it("keeps the face riding the head through every animation frame", () => {
    for (const state of STATES) {
      for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
        const grid = composedFrameGrid(APPEARANCE, "e", state, f);
        expect(countChar(grid, "g"), `${state} ${f} irises`).toBe(4);
        expect(countChar(grid, "K"), `${state} ${f} brows`).toBe(4);
      }
    }
  });

  it("applies skin and eye remaps across all layers", () => {
    const grid = composedFrameGrid(
      { build: "lean", skinTone: 2, eyeColor: "m", face: "stub" },
      "e",
      "idle",
      0,
    );
    // Canonical channels are gone; the warm-brown ramp and amber irises
    // replace them (mouth "r" pixels recolor with the skin shade too).
    for (const ch of ["q", "r", "A", "g"]) {
      expect(countChar(grid, ch), ch).toBe(0);
    }
    for (const ch of ["E", "F", "G", "m"]) {
      expect(countChar(grid, ch), ch).toBeGreaterThan(0);
    }
  });

  it("throws on an out-of-range frame index", () => {
    expect(() => composedFrameGrid(APPEARANCE, "e", "idle", 99)).toThrow(
      /no idle frame 99/,
    );
  });
});

describe("previewAppearance", () => {
  it("stays off without the dev gate and a known build", () => {
    expect(previewAppearance("")).toBeNull();
    expect(previewAppearance("?previewBody=lean")).toBeNull();
    expect(previewAppearance("?dev")).toBeNull();
    expect(previewAppearance("?dev&previewBody=giant")).toBeNull();
  });

  it("builds a stub-face descriptor from the query", () => {
    expect(previewAppearance("?dev&previewBody=heavy")).toEqual({
      build: "heavy",
      skinTone: 0,
      eyeColor: "g",
      face: "stub",
    });
  });

  it("parses previewSkin and falls back to tone 0 on junk", () => {
    expect(previewAppearance("?dev&previewBody=lean&previewSkin=2")?.skinTone).toBe(2);
    expect(previewAppearance("?dev&previewBody=lean&previewSkin=9")?.skinTone).toBe(0);
    expect(previewAppearance("?dev&previewBody=lean&previewSkin=x")?.skinTone).toBe(0);
  });
});
