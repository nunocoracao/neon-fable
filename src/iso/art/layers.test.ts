import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type MotionState } from "../animation";
import {
  composeGrids,
  composedCharacterGrid,
  composedCharacterKey,
  composedFrameKey,
  eyeColorRemap,
  layerArtGrid,
  layerOrderFor,
  orderedLayerParts,
  skinToneRemap,
  type ComposedCharacter,
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

/** A lean character with the default face parts and a given skin tone. */
function character(tone = 0): ComposedCharacter {
  const skin = skinToneRemap(tone);
  return {
    build: "lean",
    layers: [
      { slot: "body", art: "lean", remap: skin },
      { slot: "face", art: "standard", remap: { ...skin, ...eyeColorRemap("g") } },
      { slot: "face", art: "straight", remap: {} },
      { slot: "face", art: "neutral", remap: skin },
    ],
  };
}

const CHARACTER = character();

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

describe("layer art registries", () => {
  it("resolves registered body, face, and hair art per view", () => {
    expect(layerArtGrid("body", "lean", "front")).not.toBeNull();
    expect(layerArtGrid("body", "heavy", "back")).not.toBeNull();
    expect(layerArtGrid("face", "standard", "front")).not.toBeNull();
    expect(layerArtGrid("face", "straight", "front")).not.toBeNull();
    expect(layerArtGrid("face", "neutral", "front")).not.toBeNull();
    expect(layerArtGrid("hair", "buzz", "front")).not.toBeNull();
    expect(layerArtGrid("hair", "bob", "back")).not.toBeNull();
  });

  it("returns null for unregistered slots and unknown art ids", () => {
    // Headwear/gear registries land in later tasks; their catalog ids
    // resolve to nothing until then (same for unknown hair ids).
    expect(layerArtGrid("hair", "mullet", "front")).toBeNull();
    expect(layerArtGrid("headwear", "visor", "front")).toBeNull();
    expect(layerArtGrid("weapon", "wpn-rail-spitter", "front")).toBeNull();
    expect(layerArtGrid("body", "giant", "front")).toBeNull();
    expect(layerArtGrid("face", "no-such-face", "front")).toBeNull();
  });
});

describe("composed character keys", () => {
  it("equal descriptors share a key no matter how they were built", () => {
    expect(composedCharacterKey(character())).toBe(
      composedCharacterKey(CHARACTER),
    );
  });

  it("differs when the build, a layer, or a remap differs", () => {
    const heavy: ComposedCharacter = { ...CHARACTER, build: "heavy" };
    const bare: ComposedCharacter = {
      build: "lean",
      layers: CHARACTER.layers.slice(0, 1),
    };
    const withHair: ComposedCharacter = {
      ...CHARACTER,
      layers: [...CHARACTER.layers, { slot: "hair", art: "buzz", remap: {} }],
    };
    const keys = [
      CHARACTER,
      heavy,
      bare,
      withHair,
      character(1),
      character(2),
      character(3),
    ].map(composedCharacterKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("frame keys are stable and distinct per facing, state, and frame", () => {
    expect(composedFrameKey(CHARACTER, "e", "walk", 3)).toBe(
      composedFrameKey(CHARACTER, "e", "walk", 3),
    );
    const keys = [
      composedFrameKey(CHARACTER, "e", "walk", 3),
      composedFrameKey(CHARACTER, "s", "walk", 3),
      composedFrameKey(CHARACTER, "e", "idle", 3),
      composedFrameKey(CHARACTER, "e", "walk", 4),
      composedFrameKey(character(1), "e", "walk", 3),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("composedCharacterGrid", () => {
  it("returns valid 32×48 grids for every facing, state, and frame", () => {
    for (const facing of FACINGS) {
      for (const state of STATES) {
        for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
          const grid = composedCharacterGrid(CHARACTER, facing, state, f);
          expect(gridErrors(grid), `${facing} ${state} ${f}`).toEqual([]);
          expect(grid.length, `${facing} ${state} ${f}`).toBe(H);
          expect(grid[0]?.length, `${facing} ${state} ${f}`).toBe(W);
        }
      }
    }
  });

  it("draws the face parts on front views only", () => {
    expect(countChar(composedCharacterGrid(CHARACTER, "e", "idle", 0), "g")).toBe(4);
    expect(countChar(composedCharacterGrid(CHARACTER, "n", "idle", 0), "g")).toBe(0);
  });

  it("mirrors south/west from the authored views", () => {
    expect(composedCharacterGrid(CHARACTER, "s", "walk", 2)).toEqual(
      mirrored(composedCharacterGrid(CHARACTER, "e", "walk", 2)),
    );
    expect(composedCharacterGrid(CHARACTER, "w", "idle", 1)).toEqual(
      mirrored(composedCharacterGrid(CHARACTER, "n", "idle", 1)),
    );
  });

  it("keeps the face riding the head through every animation frame", () => {
    for (const state of STATES) {
      for (let f = 0; f < BODY_TIMING[state].frameCount; f++) {
        const grid = composedCharacterGrid(CHARACTER, "e", state, f);
        expect(countChar(grid, "g"), `${state} ${f} irises`).toBe(4);
        expect(countChar(grid, "K"), `${state} ${f} brows`).toBe(4);
      }
    }
  });

  it("produces a distinct grid for every skin tone", () => {
    const grids = SKIN_RAMPS.map((_, tone) =>
      composedCharacterGrid(character(tone), "e", "idle", 0).join("\n"),
    );
    expect(new Set(grids).size).toBe(SKIN_RAMPS.length);
  });

  it("applies skin and eye remaps across all layers", () => {
    const skin = skinToneRemap(2);
    const warmBrown: ComposedCharacter = {
      build: "lean",
      layers: [
        { slot: "body", art: "lean", remap: skin },
        { slot: "face", art: "standard", remap: { ...skin, ...eyeColorRemap("m") } },
        { slot: "face", art: "neutral", remap: skin },
      ],
    };
    const grid = composedCharacterGrid(warmBrown, "e", "idle", 0);
    // Canonical channels are gone; the warm-brown ramp and amber irises
    // replace them (mouth "r" pixels recolor with the skin shade too).
    for (const ch of ["q", "r", "A", "g"]) {
      expect(countChar(grid, ch), ch).toBe(0);
    }
    for (const ch of ["E", "F", "G", "m"]) {
      expect(countChar(grid, ch), ch).toBeGreaterThan(0);
    }
  });

  it("skips layers whose art has no registered grid", () => {
    const withUnregistered: ComposedCharacter = {
      ...CHARACTER,
      layers: [
        ...CHARACTER.layers,
        { slot: "hair", art: "mullet", remap: { K: "M" } },
        { slot: "weapon", art: "wpn-rail-spitter", remap: {} },
      ],
    };
    expect(composedCharacterGrid(withUnregistered, "e", "idle", 0)).toEqual(
      composedCharacterGrid(CHARACTER, "e", "idle", 0),
    );
  });

  it("throws when no layer resolves to a drawable grid", () => {
    const empty: ComposedCharacter = {
      build: "lean",
      layers: [{ slot: "hair", art: "mullet", remap: {} }],
    };
    expect(() => composedCharacterGrid(empty, "e", "idle", 0)).toThrow(
      /no drawable layers/,
    );
  });

  it("throws on an out-of-range frame index", () => {
    expect(() => composedCharacterGrid(CHARACTER, "e", "idle", 99)).toThrow(
      /no idle frame 99/,
    );
  });
});
