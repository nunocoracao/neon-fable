import { describe, expect, it } from "vitest";
import { BODY_TIMING, type Facing, type LoopState } from "../animation";
import {
  composeGrids,
  composedCharacterGrid,
  composedCharacterKey,
  composedFrameKey,
  eyeColorRemap,
  layerArtDensity,
  layerArtGrid,
  layerArtPart,
  layerOrderFor,
  partAtDensity,
  LAYER_ART_DENSITY,
  orderedLayerParts,
  outfitChannelRemap,
  skinToneRemap,
  type ComposedCharacter,
  type LayerPart,
  type LayerSlot,
} from "./layers";
import { BODY_FRAME } from "./layers/body";
import { DensityMismatchError } from "./density";
import { doubled } from "./detail";
import { SKIN_RAMPS } from "./palette";
import { gridErrors, mirrored, type PixelGrid } from "./pixel";

const { width: W, height: H } = BODY_FRAME;
const BLANK = ".".repeat(W);
const FACINGS: Facing[] = ["n", "e", "s", "w"];
const STATES: LoopState[] = ["idle", "walk"];

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

  it("keeps face above the body and below hair for every facing", () => {
    for (const facing of FACINGS) {
      const order = layerOrderFor(facing);
      expect(order.indexOf("face"), facing).toBeGreaterThan(
        order.indexOf("body"),
      );
      expect(order.indexOf("face"), facing).toBeLessThan(
        order.indexOf("hair"),
      );
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
    expect(() => eyeColorRemap("@")).toThrow(/not a palette entry/);
    expect(() => eyeColorRemap(".")).toThrow(/not a palette entry/);
  });

  it("maps the outfit channels onto material ramps, per channel", () => {
    expect(outfitChannelRemap()).toEqual({});
    expect(outfitChannelRemap("brushedChrome")).toEqual({
      V: "6",
      W: "T",
      X: "9",
    });
    expect(outfitChannelRemap(undefined, "hazardAmber")).toEqual({
      l: "Y",
      j: "Z",
      k: "n",
    });
    expect(outfitChannelRemap("brushedChrome", "hazardAmber")).toEqual({
      V: "6",
      W: "T",
      X: "9",
      l: "Y",
      j: "Z",
      k: "n",
    });
  });
});

describe("layer art registries", () => {
  it("resolves registered body, face, hair, and headwear art per view", () => {
    expect(layerArtGrid("body", "lean", "front")).not.toBeNull();
    expect(layerArtGrid("body", "heavy", "back")).not.toBeNull();
    expect(layerArtGrid("face", "standard", "front")).not.toBeNull();
    expect(layerArtGrid("face", "straight", "front")).not.toBeNull();
    expect(layerArtGrid("face", "neutral", "front")).not.toBeNull();
    expect(layerArtGrid("hair", "buzz", "front")).not.toBeNull();
    expect(layerArtGrid("hair", "bob", "back")).not.toBeNull();
    expect(layerArtGrid("hair", "crushed-short", "front")).not.toBeNull();
    expect(layerArtGrid("hair", "crushed-long", "back")).not.toBeNull();
    expect(layerArtGrid("headwear", "visor", "front")).not.toBeNull();
    expect(layerArtGrid("headwear", "rebreather", "back")).not.toBeNull();
  });

  it("resolves registered outfit and weapon art by per-build id", () => {
    expect(layerArtGrid("outfit", "slicker@lean", "front")).not.toBeNull();
    expect(layerArtGrid("outfit", "plate@heavy", "back")).not.toBeNull();
    expect(layerArtGrid("weapon", "blade@lean", "front")).not.toBeNull();
    expect(layerArtGrid("weapon", "rifle@heavy", "back")).not.toBeNull();
  });

  it("returns null for unregistered slots and unknown art ids", () => {
    // Weapon art keys by class@build — bare item ids resolve to nothing
    // (same for unknown hair/headwear ids).
    expect(layerArtGrid("hair", "mullet", "front")).toBeNull();
    expect(layerArtGrid("headwear", "crown", "front")).toBeNull();
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

describe("layer shimmer", () => {
  const SHIMMER: readonly Readonly<Record<string, string>>[] = [
    { T: "i", "6": "i" },
    { T: "g", "6": "i" },
  ];
  const withDetail = (
    shimmer?: readonly Readonly<Record<string, string>>[],
  ): ComposedCharacter => ({
    build: "lean",
    layers: [
      { slot: "body", art: "lean", remap: {} },
      {
        slot: "face",
        art: "cyber-lines",
        remap: {},
        ...(shimmer ? { shimmer } : {}),
      },
    ],
  });

  it("cycles the per-frame remap with the animation frame", () => {
    const shimmering = withDetail(SHIMMER);
    // Frame 0 remaps every trace to dim cyan; frame 1 lights T to "g".
    const f0 = composedCharacterGrid(shimmering, "e", "idle", 0);
    const f1 = composedCharacterGrid(shimmering, "e", "idle", 1);
    expect(countChar(f0, "i")).toBeGreaterThan(0);
    expect(countChar(f0, "g")).toBe(0);
    expect(countChar(f1, "g")).toBeGreaterThan(0);
    // Two-frame cycle: frame 2 wears frame 0's phase again.
    const f2 = composedCharacterGrid(shimmering, "e", "idle", 2);
    expect(countChar(f2, "g")).toBe(0);
  });

  it("leaves the authored channels untouched without shimmer", () => {
    const still = withDetail();
    for (let f = 0; f < BODY_TIMING.idle.frameCount; f++) {
      const grid = composedCharacterGrid(still, "e", "idle", f);
      expect(countChar(grid, "g"), `frame ${f}`).toBe(0);
      expect(countChar(grid, "i"), `frame ${f}`).toBe(0);
      expect(countChar(grid, "T"), `frame ${f}`).toBeGreaterThan(0);
    }
  });

  it("shimmer applies on top of the layer's own remap", () => {
    const tinted: ComposedCharacter = {
      build: "lean",
      layers: [
        { slot: "body", art: "lean", remap: {} },
        {
          slot: "face",
          art: "cyber-lines",
          remap: { "6": "p" },
          shimmer: [{ T: "g" }],
        },
      ],
    };
    const grid = composedCharacterGrid(tinted, "e", "idle", 0);
    // The layer's own node recolor survives while the trace lights up.
    expect(countChar(grid, "p")).toBeGreaterThan(0);
    expect(countChar(grid, "g")).toBeGreaterThan(0);
    expect(countChar(grid, "T")).toBe(0);
  });

  it("distinguishes descriptor keys by shimmer data", () => {
    const keys = [
      withDetail(),
      withDetail(SHIMMER),
      withDetail([{ T: "h" }]),
    ].map(composedCharacterKey);
    expect(new Set(keys).size).toBe(keys.length);
    // Equal shimmer data still shares a key.
    expect(composedCharacterKey(withDetail(SHIMMER))).toBe(
      composedCharacterKey(withDetail([...SHIMMER])),
    );
  });
});

describe("composing across authored densities", () => {
  const dense = { width: W * 2, height: H * 2, density: 2 as const };
  const coarsePart: LayerPart = { grid: frameGrid([[4, 4, "9"]]) };

  it("refuses a coarser layer with a typed error, not a size complaint", () => {
    expect(() => composeGrids([{ ...coarsePart, density: 1 }], dense)).toThrow(
      DensityMismatchError,
    );
    try {
      composeGrids([{ ...coarsePart, density: 1 }], dense);
    } catch (error) {
      const mismatch = error as DensityMismatchError;
      expect(mismatch.expected).toBe(2);
      expect(mismatch.found).toBe(1);
      expect(mismatch.message).toContain("layer 0");
    }
  });

  it("refuses a finer layer against a 1x frame just as clearly", () => {
    const finer: LayerPart = { grid: doubled(coarsePart.grid), density: 2 };
    expect(() => composeGrids([finer])).toThrow(DensityMismatchError);
  });

  it("takes an unstated density as the frame's own, so old callers are untouched", () => {
    expect(() => composeGrids([coarsePart])).not.toThrow();
    expect(composeGrids([coarsePart])).toEqual(coarsePart.grid);
  });

  it("promotes a layer that has not been re-authored yet", () => {
    const promoted = partAtDensity({ ...coarsePart, density: 1 }, 2);
    expect(promoted.density).toBe(2);
    expect(promoted.grid).toEqual(doubled(coarsePart.grid));
    // Which is exactly what the density-2 frame will accept.
    const composed = composeGrids([promoted], dense);
    expect(composed.length).toBe(H * 2);
    expect(composed[0]?.length).toBe(W * 2);
  });

  it("half-migrated composes: one promoted layer under one native one", () => {
    const native: LayerPart = {
      grid: doubled(frameGrid([[6, 6, "j"]])),
      density: 2,
    };
    const composed = composeGrids(
      [partAtDensity({ ...coarsePart, density: 1 }, 2), native],
      dense,
    );
    // Both layers land, at the same places their 1x coordinates named.
    expect(composed[8]?.[8]).toBe("9");
    expect(composed[12]?.[12]).toBe("j");
  });
});

describe("the layer registry states what it was drawn at", () => {
  it("reports 1x for every set until one is re-authored", () => {
    expect(layerArtDensity("body", "lean")).toBe(1);
    expect(layerArtDensity("hair", "buzz")).toBe(1);
    expect(Object.keys(LAYER_ART_DENSITY)).toEqual([]);
  });

  it("hands back the registered grid with its density attached", () => {
    const part = layerArtPart("body", "lean", "front");
    expect(part?.grid).toBe(layerArtGrid("body", "lean", "front"));
    expect(part?.density).toBe(1);
    expect(layerArtPart("body", "nothing-registered", "front")).toBeNull();
  });
});
