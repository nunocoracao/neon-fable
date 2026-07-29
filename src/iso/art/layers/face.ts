/**
 * Face part layers: eyes, brows, and mouth grids registered under the
 * ids the appearance catalogs reference, so composed characters resolve
 * a face straight from catalog data. Eyes and brows are authored per
 * catalog id — at 32×48 they are 1–2px strokes that must read from
 * silhouette and shade alone; the mouth is still the interim stub the
 * authored mouth-catalog task replaces. Pixels sit inside the head
 * interior of the shared 32×48 frame (see the contract in ./body),
 * shifted toward the down-right three-quarter gaze: brows on rows 6–7,
 * eyes on rows 8–9, the mouth on row 12. The back view is fully
 * transparent — faces only exist on front views.
 *
 * Channels: brows are authored in the canonical hair character ("K",
 * REMAP_CHANNELS.hair) so they recolor with the hair, irises in the eye
 * channel ("g") so the eye-color pick remaps them, and lids / the mouth
 * line in skin shade ("r") so they recolor with the skin tone.
 *
 * ## Portrait art
 *
 * Each eyes/brows id also carries a portrait-resolution grid
 * (EYE_PORTRAITS / BROW_PORTRAITS): one screen-left eye or brow with
 * the richer 2–4px strokes a head-and-shoulders portrait needs. The
 * portrait renderer mirrors the grid across the face centerline for
 * the other side and applies the same channel remaps as the sprite
 * (iris "g", brow "K", lids "r"); the structural inks "0"/"1" and
 * white "9" never remap. The appearance catalogs attach these grids to
 * their entries so the portrait task consumes them without reshaping
 * catalogs.
 */
import type { PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

/** Face part ids grouped by the appearance catalog that picks them. */
export const FACE_PART_IDS = {
  eyes: ["standard", "narrow", "wide", "cyber-band"],
  brows: ["straight", "arched", "heavy"],
  mouth: ["neutral", "smirk", "frown"],
} as const;

export type EyeShapeId = (typeof FACE_PART_IDS)["eyes"][number];
export type BrowShapeId = (typeof FACE_PART_IDS)["brows"][number];
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

/* --- Mouth: interim stub shared by every id until the authored
 * mouth-catalog task lands distinct art. --- */

const mouthFront = faceGrid([[12, 15, "rrr"]]);

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
  ...registered(
    Object.fromEntries(FACE_PART_IDS.mouth.map((id) => [id, mouthFront])),
  ),
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
