/**
 * Held-weapon layers: the slot between headwear and cyberware, driven
 * by the equipped weapon item. Five silhouette classes cover the weapon
 * item catalog: a ready knife ("blade"), a collapsed shock rod
 * ("baton"), a compact sidearm ("pistol"), a long gun held across the
 * chest ("rifle"), and a spooled live-cable whip ("lash"). Items
 * without a weapon layer reference — and bare hands — draw nothing.
 *
 * Weapons attach at the leading (right-column) hand documented in
 * BODY_FRAME.hands. The hand windows differ per build only by a one
 * column outward shift, so each class is authored once per view at the
 * lean hand position and the heavy grids derive by that same shift —
 * per-build alignment is by construction, and tests pin it. Front and
 * back views share the held silhouette; the back view drops the
 * camera-facing edge highlights and speculars (the lit edge faces away)
 * and relies on the per-facing draw order for occlusion — layerOrderFor
 * puts the weapon above the body toward camera and behind it on the
 * away facings, so only the pixels past the torso edge read from
 * behind. South/west facings mirror whole composed frames, which
 * carries the weapon to the other hand with them.
 *
 * ## Animation / region contract
 *
 * Weapons are composed onto the neutral pose and ride the shared
 * bodyAnimFrames transforms (no per-class frames — attack animation is
 * a later task). Every pixel stays inside WEAPON_REGION — rows 18
 * (shoulder line) through 32, above the walk stride's leg-shear bands
 * at LEG_TOP — so strides never cut a barrel, and clear of both
 * builds' bare-skin hand windows (BODY_FRAME.hands) so the fist reads
 * as gripping the weapon rather than being painted over.
 *
 * ## Channels
 *
 * Grids draw metal in the cyberware-chrome remap channel (6/T/9),
 * energy glow in the outfit-accent channel (l/j/k, authored magenta),
 * and neutral structure in outline 0 / ink 1. Items recolor the glow
 * per accent ramp exactly like outfit trim (weaponChannelRemap).
 */
import type { PixelGrid } from "../pixel";
import {
  BODY_BUILD_IDS,
  BODY_FRAME,
  type BodyBuildId,
  type BodyViewId,
} from "./body";

export const WEAPON_CLASS_IDS = [
  "blade",
  "baton",
  "pistol",
  "rifle",
  "lash",
] as const;
export type WeaponClassId = (typeof WEAPON_CLASS_IDS)[number];

/**
 * Rows/cols (inclusive) weapon pixels may occupy: the shoulder line
 * down to the hip row above the walk stride's leg-shear bands, with a
 * margin inside the frame edges so the heavy build's one-column shift
 * and south/west mirroring never clip a muzzle.
 */
export const WEAPON_REGION = {
  top: BODY_FRAME.neck.bottom + 2,
  bottom: 32,
  left: 3,
  right: 28,
} as const;

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const BLANK = gap(WIDTH);

type Stroke = readonly [number, number, string];

/**
 * A frame-sized grid from sparse [rowIndex, leftCol, pixels] strokes,
 * shifted dx columns right — the per-build hand offset.
 */
function weaponGrid(strokes: readonly Stroke[], dx: number): string[] {
  const grid = Array.from({ length: BODY_FRAME.height }, () => BLANK);
  for (const [y, left, pixels] of strokes) {
    const at = left + dx;
    grid[y] = gap(at) + pixels + gap(WIDTH - at - pixels.length);
  }
  return grid;
}

/**
 * The lean hand window's left column; heavy grids shift right by the
 * builds' hand offset so the grip stays on the fist for both.
 */
const BUILD_SHIFT: Readonly<Record<BodyBuildId, number>> = {
  lean: 0,
  heavy: BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0],
};

/* --- Blade: a knife held ready, edge angled up-forward from the fist
 * behind a short crossguard. The lit edge highlight faces the camera,
 * so the back view carries the flat of the blade only. --- */

const bladeFront: readonly Stroke[] = [
  [24, 25, "T9"],
  [25, 24, "T9"],
  [26, 23, "T9"],
  [27, 22, "T9"],
  [28, 21, "66"],
];

const bladeBack: readonly Stroke[] = [
  [24, 25, "TT"],
  [25, 24, "TT"],
  [26, 23, "TT"],
  [27, 22, "TT"],
  [28, 21, "66"],
];

/* --- Baton: the collapsed shock rod angled down-out of the fist, a
 * stub pommel above it and the crackling energy tip past the hip. The
 * back view's tip dims to the accent shade. --- */

const batonFront: readonly Stroke[] = [
  [28, 21, "6"],
  [31, 22, "11"],
  [32, 24, "1jk"],
];

const batonBack: readonly Stroke[] = [
  [28, 21, "6"],
  [31, 22, "11"],
  [32, 24, "1jl"],
];

/* --- Pistol: a compact sidearm held level at the hip, slide forward
 * with a muzzle specular; the frame drops below into the fist. --- */

const pistolFront: readonly Stroke[] = [
  [27, 22, "TTT9"],
  [28, 22, "6T"],
];

const pistolBack: readonly Stroke[] = [
  [27, 22, "6TTT"],
  [28, 22, "66"],
];

/* --- Rifle: the long gun carried across the chest — barrel rising
 * past the shoulder, receiver at the fist, ink stock dropping to the
 * far hip. Behind the body only the barrel reads, slung over the
 * shoulder line. --- */

const rifleFront: readonly Stroke[] = [
  [22, 26, "T9"],
  [23, 25, "T9"],
  [24, 24, "T9"],
  [25, 23, "T9"],
  [26, 22, "T9"],
  [27, 21, "6T"],
  [28, 20, "16"],
  [29, 19, "1"],
  [30, 18, "1"],
  [31, 17, "11"],
];

const rifleBack: readonly Stroke[] = [
  [22, 26, "TT"],
  [23, 25, "TT"],
  [24, 24, "TT"],
  [25, 23, "TT"],
  [26, 22, "TT"],
  [27, 21, "6T"],
  [28, 20, "16"],
  [29, 19, "1"],
  [30, 18, "1"],
  [31, 17, "11"],
];

/* --- Lash: the cable spool housed beside the fist, its live cable
 * arcing down-out past the hip to a bright crack tip. The energy reads
 * from every side; the back view loses the housing highlight and the
 * tip cools a step. --- */

const lashFront: readonly Stroke[] = [
  [27, 22, "66"],
  [28, 22, "T6"],
  [29, 24, "l"],
  [30, 25, "j"],
  [31, 26, "jk"],
  [32, 27, "k"],
];

const lashBack: readonly Stroke[] = [
  [27, 22, "66"],
  [28, 22, "66"],
  [29, 24, "l"],
  [30, 25, "j"],
  [31, 26, "jj"],
  [32, 27, "l"],
];

const STROKES: Readonly<
  Record<WeaponClassId, Readonly<Record<BodyViewId, readonly Stroke[]>>>
> = {
  blade: { front: bladeFront, back: bladeBack },
  baton: { front: batonFront, back: batonBack },
  pistol: { front: pistolFront, back: pistolBack },
  rifle: { front: rifleFront, back: rifleBack },
  lash: { front: lashFront, back: lashBack },
};

const layerSet = (
  id: WeaponClassId,
): Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>> => ({
  lean: {
    front: weaponGrid(STROKES[id].front, BUILD_SHIFT.lean),
    back: weaponGrid(STROKES[id].back, BUILD_SHIFT.lean),
  },
  heavy: {
    front: weaponGrid(STROKES[id].front, BUILD_SHIFT.heavy),
    back: weaponGrid(STROKES[id].back, BUILD_SHIFT.heavy),
  },
});

/** The weapon grids per class, build, and view, all 32×48. */
export const WEAPON_LAYERS: Readonly<
  Record<
    WeaponClassId,
    Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, PixelGrid>>>>
  >
> = {
  blade: layerSet("blade"),
  baton: layerSet("baton"),
  pistol: layerSet("pistol"),
  rifle: layerSet("rifle"),
  lash: layerSet("lash"),
};

/**
 * Flat registry art id for a weapon class held by a build — the same
 * `family@build` scheme outfits use, so resolveLayers composes it from
 * the item's layer reference and the character's build.
 */
export function weaponArtId(layer: string, build: BodyBuildId): string {
  return `${layer}@${build}`;
}

/** The flat per-view registry the layer engine consumes. */
export const WEAPON_GRIDS: Readonly<
  Record<string, Readonly<Record<BodyViewId, PixelGrid>>>
> = Object.fromEntries(
  WEAPON_CLASS_IDS.flatMap((id) =>
    BODY_BUILD_IDS.map((build) => [weaponArtId(id, build), WEAPON_LAYERS[id][build]]),
  ),
);
