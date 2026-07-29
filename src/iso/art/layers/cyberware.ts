/**
 * Cyberware overlay layers: the topmost slot, driven by the installed
 * enhancement items. Six overlay families cover every install point in
 * the enhancement catalog: glowing replacement optics ("optics"), a
 * full chrome arm ("chrome-arm"), a temple data port ("neural-jack"),
 * rib filtration slits ("gill-slits"), dermal plating traces
 * ("dermal-plate"), and a subdermal projection film ("veil-film").
 * Enhancement items reference a family through their typed cyberLayer
 * field; items without one (and empty install slots) draw nothing.
 *
 * All grids share the 32×48 frame contract in ./body and compose above
 * every other layer (chrome reads over clothing — installed hardware
 * is always visible). Overlays ride the shared bodyAnimFrames
 * transforms, so every pixel stays inside CYBER_REGION — the head box
 * down through the hand rows, above the walk stride's leg-shear bands.
 * South/west facings mirror whole composed frames.
 *
 * Head-anchored families (optics, neural-jack, veil-film) share one
 * grid set per build — head rows are identical across builds. Torso-
 * anchored families marked `shifts` derive their heavy grids by the
 * builds' one-column hand offset, exactly like weapons, so the arm and
 * ribs track the heavy silhouette; the centered dermal plate stays
 * put. Back views drop camera-facing speculars (9 -> T) and cool the
 * neon a step (k -> j, j -> l); the optics glow is front-only.
 *
 * ## Channels
 *
 * Grids draw hardware in the cyberware-chrome remap channel (6/T/9)
 * with outline 0 / ink 1 structure, and neon glow in the outfit-accent
 * channel (l/j/k, authored magenta) — items recolor the glow per
 * accent ramp exactly like weapon energy (cyberChannelRemap). Pulsing
 * families cycle the glow channel through cyberPulseFrames, the same
 * per-frame shimmer mechanism the cyber-lines face detail uses.
 *
 * ## Interaction rules
 *
 * CYBER_LAYER_TRAITS carries the data resolveLayers keys off: the
 * optics family sits on the eye rows (8–9), inside the band the
 * coversEyes headwear glass spans, so an eye-covering visor drops the
 * optics layer from the sprite exactly like the eyes layer.
 *
 * ## Portrait art
 *
 * Head-region families also carry a portrait-resolution overlay
 * (CYBER_PORTRAITS), authored 16 wide on the portrait face box like
 * the face-detail portraits. Portraits always stamp installed head
 * cyberware — even under eye-covering headwear, whose lens glass is
 * dithered translucent — which is how a visored character keeps the
 * optic glow in portraits while the sprite hides it.
 */
import type { ChannelRemap, PixelGrid } from "../pixel";
import {
  MATERIAL_RAMPS,
  type ColorRamp,
  type MaterialName,
} from "../palette";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  type BodyBuildId,
  type BodyViewId,
} from "./body";

export const CYBER_LAYER_IDS = [
  "optics",
  "chrome-arm",
  "neural-jack",
  "gill-slits",
  "dermal-plate",
  "veil-film",
] as const;
export type CyberLayerId = (typeof CYBER_LAYER_IDS)[number];

/**
 * Rows/cols (inclusive) cyberware pixels may occupy: the head box down
 * through the hand rows (29–30), above the walk stride's leg-shear
 * bands, with a margin inside the frame edges so the heavy build's
 * one-column shift and south/west mirroring never clip a plate.
 */
export const CYBER_REGION = {
  top: BODY_FRAME.head.top,
  bottom: 30,
  left: 8,
  right: 24,
} as const;

/**
 * Per-family interaction metadata resolveLayers and the tests consume.
 * Pure data — the resolver never switches on family ids.
 */
export interface CyberLayerTraits {
  /**
   * The overlay sits on the eye rows: eye-covering headwear hides it
   * on the sprite (portraits keep it — lens glass is dithered).
   */
  readonly eyeRegion: boolean;
  /** Cycles the 2-frame neon pulse from cyberPulseFrames. */
  readonly pulses: boolean;
  /** Heavy grids derive by the builds' one-column hand offset. */
  readonly shifts: boolean;
}

export const CYBER_LAYER_TRAITS: Readonly<
  Record<CyberLayerId, CyberLayerTraits>
> = {
  optics: { eyeRegion: true, pulses: true, shifts: false },
  "chrome-arm": { eyeRegion: false, pulses: false, shifts: true },
  "neural-jack": { eyeRegion: false, pulses: false, shifts: false },
  "gill-slits": { eyeRegion: false, pulses: false, shifts: true },
  "dermal-plate": { eyeRegion: false, pulses: false, shifts: false },
  "veil-film": { eyeRegion: false, pulses: true, shifts: false },
};

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const BLANK = gap(WIDTH);

type Stroke = readonly [number, number, string];

/**
 * A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes,
 * shifted dx columns right — the per-build hand offset.
 */
function cyberGrid(strokes: readonly Stroke[], dx: number): string[] {
  const grid = Array.from({ length: BODY_FRAME.height }, () => BLANK);
  for (const [y, left, pixels] of strokes) {
    const at = left + dx;
    grid[y] = gap(at) + pixels + gap(WIDTH - at - pixels.length);
  }
  return grid;
}

/** Back views lose speculars and cool the neon one ramp step. */
const BACK_DIM: Readonly<Record<string, string>> = { "9": "T", k: "j", j: "l" };

function dimmed(strokes: readonly Stroke[]): Stroke[] {
  return strokes.map(([y, left, pixels]) => [
    y,
    left,
    [...pixels].map((ch) => BACK_DIM[ch] ?? ch).join(""),
  ]);
}

/**
 * The lean hand window's left column offset to the heavy build's —
 * shifting families track the heavy silhouette's extra width.
 */
const BUILD_SHIFT: Readonly<Record<BodyBuildId, number>> = {
  lean: 0,
  heavy: BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0],
};

/* --- Optics: replacement eyes as glowing irises on the canonical eye
 * rows (8–9), with a dim under-glow bleeding onto the cheekbones. The
 * glow pulses (2-frame flare via cyberPulseFrames). Front views only —
 * eyes never read from behind. --- */

const opticsFront: readonly Stroke[] = [
  [8, 14, "jj.jj"],
  [9, 14, "l...l"],
];

/* --- Chrome arm: the leading (screen-right) arm's sleeve and hand
 * replaced with plated chrome — shoulder cap rim, lit inner plate
 * edge, an elbow servo glow, and a chrome fist with a knuckle light
 * over the bare-skin hand window. --- */

const chromeArmFront: readonly Stroke[] = [
  [17, 19, "T9"],
  [18, 20, "9TT"],
  [19, 20, "TT6"],
  [20, 20, "TT6"],
  [21, 20, "T66"],
  [22, 20, "Tj6"],
  [23, 20, "TT6"],
  [24, 20, "TT6"],
  [25, 20, "T66"],
  [26, 20, "T6"],
  [27, 20, "T6"],
  [28, 20, "66"],
  [29, 20, "Tj"],
  [30, 20, "66"],
];

/* --- Neural jack: a chrome data port at the screen-right temple with
 * a status light; from behind, the jack sits at the nape instead. --- */

const neuralJackFront: readonly Stroke[] = [
  [5, 19, "66"],
  [6, 19, "Tj"],
  [7, 19, "66"],
];

const neuralJackBack: readonly Stroke[] = [
  [12, 15, "66"],
  [13, 15, "Tj"],
];

/* --- Gill slits: chrome-rimmed filtration slits grafted down the
 * screen-right ribs; edge-on from behind only the ink seams read. --- */

const gillSlitsFront: readonly Stroke[] = [
  [20, 18, "16"],
  [21, 18, "16"],
  [22, 18, "16"],
  [23, 18, "16"],
];

const gillSlitsBack: readonly Stroke[] = [
  [20, 18, "1"],
  [21, 18, "1"],
  [22, 18, "1"],
  [23, 18, "1"],
];

/* --- Dermal plating: subdermal armor seams tracing the torso — a
 * collar plate line with a center specular, twin trace rails, and a
 * waist seam. Centered on the frame, so both builds share cols. --- */

const dermalPlateFront: readonly Stroke[] = [
  [18, 13, "6TT9TT6"],
  [20, 12, "6......6"],
  [22, 12, "T......T"],
  [24, 13, "6.....6"],
];

/* --- Veil film: the projection film's emitter traces down both
 * temples, cheeks, and jaw, all in the glow channel — the film itself
 * pulses (static smear, via cyberPulseFrames). --- */

const veilFilmFront: readonly Stroke[] = [
  [5, 11, "l........l"],
  [7, 11, "j........j"],
  [10, 12, "j.......j"],
  [12, 13, "l.....l"],
];

interface CyberLayerSpec {
  readonly front: readonly Stroke[];
  readonly back: readonly Stroke[];
}

const SPECS: Readonly<Record<CyberLayerId, CyberLayerSpec>> = {
  optics: { front: opticsFront, back: [] },
  "chrome-arm": { front: chromeArmFront, back: dimmed(chromeArmFront) },
  "neural-jack": { front: neuralJackFront, back: neuralJackBack },
  "gill-slits": { front: gillSlitsFront, back: gillSlitsBack },
  "dermal-plate": { front: dermalPlateFront, back: dimmed(dermalPlateFront) },
  "veil-film": { front: veilFilmFront, back: dimmed(veilFilmFront) },
};

const layerSet = (
  id: CyberLayerId,
): Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>> => {
  const grids = (dx: number): Readonly<Record<BodyViewId, PixelGrid>> => ({
    front: cyberGrid(SPECS[id].front, dx),
    back: cyberGrid(SPECS[id].back, dx),
  });
  return {
    lean: grids(BUILD_SHIFT.lean),
    heavy: grids(CYBER_LAYER_TRAITS[id].shifts ? BUILD_SHIFT.heavy : 0),
  };
};

/** The cyberware grids per family, build, and view, all 32×48. */
export const CYBER_LAYERS: Readonly<
  Record<
    CyberLayerId,
    Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>>
  >
> = {
  optics: layerSet("optics"),
  "chrome-arm": layerSet("chrome-arm"),
  "neural-jack": layerSet("neural-jack"),
  "gill-slits": layerSet("gill-slits"),
  "dermal-plate": layerSet("dermal-plate"),
  "veil-film": layerSet("veil-film"),
};

/**
 * Flat registry art id for a cyberware family on a build — the same
 * `family@build` scheme outfits and weapons use, so resolveLayers
 * composes it from the item's layer reference and the character's
 * build.
 */
export function cyberArtId(layer: string, build: BodyBuildId): string {
  return `${layer}@${build}`;
}

/** The flat per-view registry the layer engine consumes. */
export const CYBER_GRIDS: Readonly<
  Record<string, Readonly<Record<BodyViewId, PixelGrid>>>
> = Object.fromEntries(
  CYBER_LAYER_IDS.flatMap((id) =>
    BODY_BUILD_IDS.map((build) => [cyberArtId(id, build), CYBER_LAYERS[id][build]]),
  ),
);

/** The authored accent channel as a ramp: l dim, j base, k bright. */
const CANONICAL_GLOW: ColorRamp = { shade: "l", base: "j", highlight: "k" };

/**
 * 2-frame neon pulse for a glow accent: per-frame channel remaps the
 * layer engine cycles by animation frame (the same shimmer mechanism
 * as the cyber-lines face detail). Frame 0 sinks the glow to the
 * ramp's shade; frame 1 flares it to the highlight. Pure and
 * deterministic per accent, so equal installs share cache keys.
 */
export function cyberPulseFrames(
  accent?: MaterialName,
): readonly ChannelRemap[] {
  const ramp = accent ? MATERIAL_RAMPS[accent] : CANONICAL_GLOW;
  return [
    { l: ramp.shade, j: ramp.shade, k: ramp.base },
    { l: ramp.shade, j: ramp.highlight, k: ramp.highlight },
  ];
}

/* --- Portrait overlays for the head-region families, on the 16×12
 * portrait face box (brow line at the top rows, chin at the bottom),
 * matching the face-detail portrait convention. Glow pixels stay in
 * the accent channel so the item's recolor applies; portraits render
 * the resting glow — the pulse is sprite-only, like cyber-lines. --- */

export const CYBER_PORTRAITS: Readonly<Partial<Record<CyberLayerId, PixelGrid>>> = {
  // Ink-housed optic rings, lit from the iris out.
  optics: [
    "................",
    "................",
    "..1jj1....1jj1..",
    "..jkkj....jkkj..",
    "..1jj1....1jj1..",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // The temple data port with its status light.
  "neural-jack": [
    "................",
    "................",
    ".............66.",
    ".............Tj.",
    ".............66.",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Emitter traces framing the face down to the jaw.
  "veil-film": [
    "................",
    ".l............l.",
    ".j............j.",
    ".l............l.",
    ".j............j.",
    ".l............l.",
    "..j..........j..",
    "..l..........l..",
    "................",
    "...j........j...",
    "................",
    "................",
  ],
};
