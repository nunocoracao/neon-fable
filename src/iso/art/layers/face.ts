/**
 * Stub face layer: the minimal front-view face (brows, irises, mouth)
 * that proves the layered composition pipeline end-to-end before the
 * authored face catalogs land. Pixels sit inside the head-interior
 * rows 6–13 of the shared 32×48 frame (see the contract in ./body),
 * shifted toward the down-right three-quarter gaze.
 *
 * Channels: brows are authored in the canonical hair character ("K",
 * REMAP_CHANNELS.hair), irises in the eye channel ("g"), and the mouth
 * line in skin shade ("r") so it recolors with the skin tone. The back
 * view is fully transparent — faces only exist on front views.
 */
import type { PixelGrid } from "../pixel";
import { BODY_FRAME, type BodyViewId } from "./body";

export const FACE_LAYER_IDS = ["stub"] as const;
export type FaceLayerId = (typeof FACE_LAYER_IDS)[number];

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);
const BLANK = gap(WIDTH);

const stubFront: readonly string[] = [
  ...rep(7, BLANK),
  row(14, "KK.KK"), // brows (hair channel)
  row(14, "gg.gg"), // irises (eye channel)
  ...rep(3, BLANK),
  row(15, "rrr"), // mouth (skin shade)
  ...rep(BODY_FRAME.height - 13, BLANK),
];

export const FACE_LAYERS: Readonly<
  Record<FaceLayerId, Readonly<Record<BodyViewId, PixelGrid>>>
> = {
  stub: { front: stubFront, back: rep(BODY_FRAME.height, BLANK) },
};
