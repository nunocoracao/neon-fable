/**
 * Face part layers: eyes, brows, and mouth grids registered under the
 * ids the appearance catalogs reference, so composed characters resolve
 * a face straight from catalog data. The grids are interim stubs — one
 * shared drawing per part, derived from the pipeline-proof face — and
 * the authored face-catalog task replaces them with distinct art per id
 * without touching the wiring. Pixels sit inside the head-interior
 * rows of the shared 32×48 frame (see the contract in ./body), shifted
 * toward the down-right three-quarter gaze.
 *
 * Channels: brows are authored in the canonical hair character ("K",
 * REMAP_CHANNELS.hair), irises in the eye channel ("g"), and the mouth
 * line in skin shade ("r") so it recolors with the skin tone. The back
 * view is fully transparent — faces only exist on front views.
 */
import type { PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

/** Face part ids grouped by the appearance catalog that picks them. */
export const FACE_PART_IDS = {
  eyes: ["standard", "narrow", "wide"],
  brows: ["straight", "arched", "heavy"],
  mouth: ["neutral", "smirk", "frown"],
} as const;

export type FaceLayerId = (typeof FACE_PART_IDS)[keyof typeof FACE_PART_IDS][number];

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);
const BLANK = gap(WIDTH);

/** A front grid with one drawn row at the given frame row index. */
function partFront(y: number, left: number, pixels: string): readonly string[] {
  return [
    ...rep(y, BLANK),
    row(left, pixels),
    ...rep(BODY_FRAME.height - y - 1, BLANK),
  ];
}

const eyesFront = partFront(8, 14, "gg.gg"); // irises (eye channel)
const browsFront = partFront(7, 14, "KK.KK"); // brows (hair channel)
const mouthFront = partFront(12, 15, "rrr"); // mouth (skin shade)

const BACK: PixelGrid = rep(BODY_FRAME.height, BLANK);

function registered(
  ids: readonly FaceLayerId[],
  front: readonly string[],
): Array<[FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>]> {
  return ids.map((id) => [id, { front, back: BACK }]);
}

export const FACE_LAYERS: Readonly<
  Record<FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>>
> = Object.fromEntries([
  ...registered(FACE_PART_IDS.eyes, eyesFront),
  ...registered(FACE_PART_IDS.brows, browsFront),
  ...registered(FACE_PART_IDS.mouth, mouthFront),
]) as Record<FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>>;
