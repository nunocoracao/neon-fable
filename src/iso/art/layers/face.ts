/**
 * Face part layers: eyes, brows, mouth, and face-detail grids
 * registered under the ids the appearance catalogs reference, so
 * composed characters resolve a face straight from catalog data. Every part is authored per catalog
 * id — at 32×48 they are 1–2px strokes that must read from silhouette
 * and shade alone. Pixels sit inside the head interior of the shared
 * 32×48 frame (see the contract in ./body), shifted toward the
 * down-right three-quarter gaze: brows on rows 6–7, eyes on rows 8–9,
 * the mouth on rows 11–13. The back view is fully transparent — faces
 * only exist on front views.
 *
 * Channels: brows are authored in the canonical hair character ("K",
 * REMAP_CHANNELS.hair) so they recolor with the hair, irises in the eye
 * channel ("g") so the eye-color pick remaps them, and lids / mouth
 * lines in skin shade ("r") so they recolor with the skin tone. The
 * breather-mask mouth is hardware, not skin: it draws in the
 * cyber-chrome channel ("6"/"T"/"9") so it never recolors with the
 * skin tone.
 *
 * ## Portrait art
 *
 * Each eyes/brows/mouth id also carries a portrait-resolution grid
 * (EYE_PORTRAITS / BROW_PORTRAITS / MOUTH_PORTRAITS) with the richer
 * 2–4px strokes a head-and-shoulders portrait needs. Eye and brow
 * grids are one screen-left part the portrait renderer mirrors across
 * the face centerline; mouth grids sit on the centerline and are drawn
 * whole. The renderer applies the same channel remaps as the sprite
 * (iris "g", brow "K", lips "r"/"q"); the structural inks "0"/"1",
 * white "9", and chrome never remap with skin. The appearance catalogs
 * attach these grids to their entries so the portrait task consumes
 * them without reshaping catalogs.
 *
 * ## Expressions
 *
 * Portraits can emote; sprites cannot (too few pixels), so sprites
 * always render the resting mouth. EXPRESSION_IDS names the expression
 * states, and MOUTH_EXPRESSION_PORTRAITS / BROW_EXPRESSION_PORTRAITS
 * carry one portrait-resolution variant per part id per expression —
 * the "neutral" variant is the resting portrait grid itself. The
 * catalogs attach these records to their entries and
 * resolveExpression (src/data/appearance.ts) picks the overlay pair
 * for a mouth+brow combination; dialogue wiring consumes that helper
 * in a later task.
 */
import type { ChannelRemap, PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

/** Face part ids grouped by the appearance catalog that picks them. */
export const FACE_PART_IDS = {
  eyes: ["standard", "narrow", "wide", "cyber-band"],
  brows: ["straight", "arched", "heavy"],
  // "neutral"/"smirk"/"frown" keep their persisted ids from the schema
  // task; the catalog labels them Neutral Line / Slight Smirk / Hard Set.
  mouth: ["neutral", "smirk", "frown", "breather"],
  // "scar"/"tattoo" keep their persisted ids from the schema task; the
  // catalog labels them Cheek Scar / Geometric Tattoo.
  faceDetail: ["scar", "brow-split", "tattoo", "cyber-lines", "circuit-ink"],
} as const;

export type EyeShapeId = (typeof FACE_PART_IDS)["eyes"][number];
export type BrowShapeId = (typeof FACE_PART_IDS)["brows"][number];
export type MouthStyleId = (typeof FACE_PART_IDS)["mouth"][number];
export type FaceDetailId = (typeof FACE_PART_IDS)["faceDetail"][number];

/** Expression states a portrait can render; sprites stay resting. */
export const EXPRESSION_IDS = ["neutral", "smile", "grim", "shocked"] as const;

export type ExpressionId = (typeof EXPRESSION_IDS)[number];
export type FaceLayerId = (typeof FACE_PART_IDS)[keyof typeof FACE_PART_IDS][number];

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);
const BLANK = gap(WIDTH);

/** A frame-sized front grid from sparse [rowIndex, leftCol, pixels] strokes. */
function faceGrid(
  strokes: ReadonlyArray<readonly [number, number, string]>,
): string[] {
  const grid = Array.from({ length: BODY_FRAME.height }, () => BLANK);
  for (const [y, left, pixels] of strokes) grid[y] = row(left, pixels);
  return grid;
}

/* --- Eyes, rows 8–9. Standard: two 2px irises. Narrow: single-pixel
 * irises pulled inward under shaded outer corners — a guarded squint.
 * Wide: the standard irises doubled to two rows, big and open.
 * Cyber-band: one unbroken implant strip spanning both sockets, the
 * whole band in the eye channel so the eye color lights it. --- */

const EYE_FRONTS: Readonly<Record<EyeShapeId, PixelGrid>> = {
  standard: faceGrid([[8, 14, "gg.gg"]]),
  narrow: faceGrid([[8, 13, "rg..gr"]]),
  wide: faceGrid([
    [8, 14, "gg.gg"],
    [9, 14, "gg.gg"],
  ]),
  "cyber-band": faceGrid([[8, 12, "gggggggg"]]),
};

/* --- Brows, rows 6–7. Straight: flat 2px dashes, level and calm.
 * Arched: the same dashes with raised outer tips on row 6 — a lifted,
 * expressive angle. Heavy: solid 3px blocks two rows thick that read
 * as a scowl at range. --- */

const BROW_FRONTS: Readonly<Record<BrowShapeId, PixelGrid>> = {
  straight: faceGrid([[7, 14, "KK.KK"]]),
  arched: faceGrid([
    [6, 13, "K.....K"],
    [7, 14, "KK.KK"],
  ]),
  heavy: faceGrid([
    [6, 13, "KKK.KKK"],
    [7, 13, "KKK.KKK"],
  ]),
};

/* --- Mouths, rows 11–13. Neutral: a level 3px resting line. Smirk:
 * a shorter line with the outer corner lifted a row — a lopsided
 * half-smile. Frown ("hard set"): a 5px pressed line, wider and
 * flatter than neutral. Breather: a small chrome respirator mask
 * covering the lower face, authored in the cyber-chrome channel so it
 * stays hardware-colored under any skin tone. --- */

const MOUTH_FRONTS: Readonly<Record<MouthStyleId, PixelGrid>> = {
  neutral: faceGrid([[12, 15, "rrr"]]),
  smirk: faceGrid([
    [11, 17, "r"],
    [12, 15, "rr"],
  ]),
  frown: faceGrid([[12, 14, "rrrrr"]]),
  breather: faceGrid([
    [11, 14, "6TTT6"],
    [12, 14, "6T6T6"],
    [13, 15, "666"],
  ]),
};

/* --- Face details: an overlay stacked above the other face parts and
 * below hair (resolveLayers pushes it last among the face entries).
 * Scars ("scar" = cheek scar, "brow-split") draw in the skin channel —
 * pale "A" scar tissue with an "r" shaded tail — so they recolor with
 * the skin tone. Inked details ("tattoo", "circuit-ink") draw in the
 * tattoo-ink channel (hologram-blue ramp) so later dye options arrive
 * by remap. "cyber-lines" is subdermal hardware in the cyber-chrome
 * channel; its sprite glow comes from CYBER_LINES_SHIMMER below. --- */

const FACE_DETAIL_FRONTS: Readonly<Record<FaceDetailId, PixelGrid>> = {
  // A pale slash down the screen-right cheek, past the eye corner.
  scar: faceGrid([
    [9, 20, "A"],
    [10, 20, "A"],
    [11, 19, "Ar"],
    [12, 19, "A"],
  ]),
  // A notch splitting the screen-right brow, nicking the eye corner.
  "brow-split": faceGrid([
    [5, 18, "A"],
    [6, 18, "A"],
    [7, 18, "A"],
    [8, 19, "r"],
  ]),
  // A zigzag chevron inked down the screen-left temple and cheek.
  tattoo: faceGrid([
    [4, 12, "s"],
    [5, 11, "t"],
    [6, 11, "tt"],
    [7, 12, "t"],
    [8, 11, "t"],
    [9, 12, "t"],
    [10, 11, "t"],
    [11, 12, "s"],
  ]),
  // Faint subdermal traces down both temples with under-eye nodes.
  // Row 4 stays inside cols 13–19: the skull narrows at the crown and
  // its outline pixels sit at cols 11/20 there.
  "cyber-lines": faceGrid([
    [4, 13, "6.....6"],
    [5, 12, "T.......T"],
    [6, 11, "T........T"],
    [10, 12, "6.......6"],
    [11, 13, "T"],
    [12, 19, "T"],
  ]),
  // Full-face circuit ink: rails framing the face, node taps, chin bus.
  "circuit-ink": faceGrid([
    [4, 12, "t.t..t.t"],
    [5, 11, "s...t...s"],
    [6, 11, "t........t"],
    [7, 11, "s........s"],
    [8, 11, "t........t"],
    [9, 11, "t........t"],
    [10, 11, "st......ts"],
    [11, 12, "u......u"],
    [12, 13, "t.....t"],
    [13, 14, "t.t.t"],
  ]),
};

/**
 * 2-frame sprite shimmer for the subdermal cyber-lines: per-frame
 * channel remaps the layer engine applies on top of the layer's own
 * remap, cycling by animation frame. Frame 0 sinks the chrome traces
 * to dim cyan; frame 1 flares the trace runs to full neon while the
 * node pixels stay dim. The catalog attaches this to the cyber-lines
 * entry, so the glow stays data-driven — no engine special case.
 */
export const CYBER_LINES_SHIMMER: readonly ChannelRemap[] = [
  { "6": "i", T: "i" },
  { "6": "i", T: "g" },
];

const BACK: PixelGrid = rep(BODY_FRAME.height, BLANK);

function registered(
  fronts: Readonly<Partial<Record<FaceLayerId, PixelGrid>>>,
): Array<[FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>]> {
  return Object.entries(fronts).map(([id, front]) => [
    id as FaceLayerId,
    { front, back: BACK },
  ]);
}

export const FACE_LAYERS: Readonly<
  Record<FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>>
> = Object.fromEntries([
  ...registered(EYE_FRONTS),
  ...registered(BROW_FRONTS),
  ...registered(MOUTH_FRONTS),
  ...registered(FACE_DETAIL_FRONTS),
]) as Record<FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>>;

/* --- Portrait grids: one screen-left eye/brow each (see the module
 * comment). Kept small and rectangular; a test validates palette
 * membership and channel discipline. --- */

export const EYE_PORTRAITS: Readonly<Record<EyeShapeId, PixelGrid>> = {
  // Almond eye: lash line over white sclera around a 2×2 iris.
  standard: [
    "..1111..",
    ".19gg91.",
    ".19gg91.",
    "..rrrr..",
  ],
  // Heavy-lidded slit: one open row under a full lash line.
  narrow: [
    "........",
    ".111111.",
    "..9gg9..",
    "...rr...",
  ],
  // Round and open: sclera above and below a centered iris.
  wide: [
    "..1111..",
    ".199991.",
    ".19gg91.",
    ".199991.",
    "..1111..",
  ],
  // Implant visor segment: an ink housing around a lit strip.
  "cyber-band": [
    "11111111",
    "1gggggg1",
    "1gggggg1",
    "11111111",
  ],
};

export const BROW_PORTRAITS: Readonly<Record<BrowShapeId, PixelGrid>> = {
  // Level single stroke.
  straight: [
    "........",
    ".KKKKKK.",
    "........",
  ],
  // Outer (screen-left) tip raised, sweeping down toward the nose.
  arched: [
    ".KK.....",
    "..KKKKK.",
    "........",
  ],
  // Two rows thick, edge to edge.
  heavy: [
    ".KKKKKK.",
    ".KKKKKK.",
    "........",
  ],
};

/* --- Mouth portraits: the whole mouth on the face centerline (not
 * mirrored). Lip line in skin shade "r", lower-lip catchlight in skin
 * base "q"; the breather mask keeps its chrome housing behind an ink
 * outline. --- */

export const MOUTH_PORTRAITS: Readonly<Record<MouthStyleId, PixelGrid>> = {
  // Level resting line over a soft lower lip.
  neutral: [
    "........",
    ".rrrrrr.",
    "..qqqq..",
  ],
  // One corner pulled up; the lip follows the tilt.
  smirk: [
    "......r.",
    ".rrrrr..",
    "..qqq...",
  ],
  // Hard set: pressed edge to edge, no soft lip at all.
  frown: [
    "........",
    "rrrrrrrr",
    "........",
  ],
  // Respirator mask: ink-outlined chrome shell with shaded vents.
  breather: [
    ".111111.",
    "16TTTT61",
    "16T66T61",
    ".116611.",
  ],
};

/* --- Face-detail portraits: a whole-face overlay per detail id (not
 * mirrored), authored 16 wide on the portrait face box — brow line at
 * the top rows, chin at the bottom — and stamped over the composed
 * resting face by the portrait renderer. Scars stay in the skin
 * channel, ink in the tattoo-ink channel, cyber-lines in cyber-chrome
 * (with a "9" specular; portraits render the resting chrome — the
 * shimmer is sprite-only). --- */

export const FACE_DETAIL_PORTRAITS: Readonly<Record<FaceDetailId, PixelGrid>> = {
  // A pale healed slash down the screen-right cheek.
  scar: [
    "................",
    "................",
    "................",
    "............A...",
    "............Ar..",
    "...........Ar...",
    "...........A....",
    "..........Ar....",
    "..........A.....",
    "................",
    "................",
    "................",
  ],
  // A vertical notch splitting the screen-right brow line.
  "brow-split": [
    "................",
    "...........A....",
    "...........A....",
    "...........A....",
    "...........A....",
    "............r...",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
  // Chevrons inked down the screen-left temple and cheek.
  tattoo: [
    "................",
    "..t.............",
    "..tt............",
    "...tt...........",
    "....t...........",
    "...tt...........",
    "..tt............",
    "..t.............",
    "...s............",
    "................",
    "................",
    "................",
  ],
  // Subdermal trace rails down both temples with under-eye nodes.
  "cyber-lines": [
    ".6...........6..",
    ".T...........T..",
    ".T...........T..",
    ".9...........9..",
    ".T...........T..",
    ".6...........6..",
    "..T.........T...",
    "................",
    "..6.........6...",
    "................",
    "................",
    "................",
  ],
  // Full-face circuit ink: rails, node taps, and a chin bus.
  "circuit-ink": [
    "..t.t..tt..t.t..",
    ".s....t..t....s.",
    ".t............t.",
    ".t.....u......t.",
    ".t............t.",
    ".s............s.",
    ".t............t.",
    ".ts..........st.",
    "..t..........t..",
    "..u..........u..",
    "...t...tt...t...",
    "......t..t......",
  ],
};

/* --- Expression variants, portrait resolution only. One grid per part
 * id per expression; "neutral" is the resting portrait itself. Mouths
 * reshape the lips (the breather's shell never moves — its vent strip
 * changes state instead: lit cyan smiling, blacked out grim, flared
 * white shocked). Brows shift and re-angle their strokes. --- */

export const MOUTH_EXPRESSION_PORTRAITS: Readonly<
  Record<MouthStyleId, Readonly<Record<ExpressionId, PixelGrid>>>
> = {
  neutral: {
    neutral: MOUTH_PORTRAITS.neutral,
    // Corners up into an open curve.
    smile: [
      ".r....r.",
      "..rrrr..",
      "...qq...",
    ],
    // Corners dragged down.
    grim: [
      "........",
      ".rrrrrr.",
      ".r....r.",
    ],
    // A round, open gasp.
    shocked: [
      "..rrrr..",
      ".r....r.",
      ".r....r.",
      "..rrrr..",
    ],
  },
  smirk: {
    neutral: MOUTH_PORTRAITS.smirk,
    // The half-smile widens into a lopsided grin.
    smile: [
      ".r.....r",
      "..rrrrr.",
      "...qqq..",
    ],
    // The lifted corner drops; the line presses flat.
    grim: [
      "........",
      ".rrrrrr.",
      "......r.",
    ],
    // Open, still slanted.
    shocked: [
      "..rrrr..",
      ".r....r.",
      "..rrr...",
    ],
  },
  frown: {
    neutral: MOUTH_PORTRAITS.frown,
    // A reluctant thin curve.
    smile: [
      ".r....r.",
      "..rrrr..",
      "........",
    ],
    // The set line doubles into a clench.
    grim: [
      "rrrrrrrr",
      "rrrrrrrr",
      "........",
    ],
    // A tight, controlled opening.
    shocked: [
      "..rrrr..",
      "..r..r..",
      "..rrrr..",
    ],
  },
  breather: {
    neutral: MOUTH_PORTRAITS.breather,
    // Vent strip lights cyan.
    smile: [
      ".111111.",
      "16TTTT61",
      "16gggg61",
      ".116611.",
    ],
    // Vent strip blacks out.
    grim: [
      ".111111.",
      "16TTTT61",
      "16111161",
      ".116611.",
    ],
    // Vent strip flares white.
    shocked: [
      ".111111.",
      "16TTTT61",
      "19999991",
      ".116611.",
    ],
  },
};

export const BROW_EXPRESSION_PORTRAITS: Readonly<
  Record<BrowShapeId, Readonly<Record<ExpressionId, PixelGrid>>>
> = {
  straight: {
    neutral: BROW_PORTRAITS.straight,
    // Lifted one row.
    smile: [
      ".KKKKKK.",
      "........",
      "........",
    ],
    // Broken and angled down toward the nose.
    grim: [
      "........",
      ".KKK....",
      "....KKK.",
    ],
    // Thrown up into an arch.
    shocked: [
      "..KKKK..",
      ".K....K.",
      "........",
    ],
  },
  arched: {
    neutral: BROW_PORTRAITS.arched,
    // The sweep relaxes, tip softening.
    smile: [
      ".KKK....",
      "...KKKK.",
      "........",
    ],
    // The whole brow dives inward.
    grim: [
      "........",
      ".KK.....",
      "...KKKKK",
    ],
    // Arched high off the eye.
    shocked: [
      ".KKKKK..",
      "K.....K.",
      "........",
    ],
  },
  heavy: {
    neutral: BROW_PORTRAITS.heavy,
    // The block thins to a single relaxed row.
    smile: [
      "........",
      ".KKKKKK.",
      "........",
    ],
    // A stepped scowl bearing down.
    grim: [
      ".KKK....",
      "..KKKKK.",
      "....KKK.",
    ],
    // The full block jumps up and spreads.
    shocked: [
      "KKKKKKKK",
      ".KKKKKK.",
      "........",
    ],
  },
};
