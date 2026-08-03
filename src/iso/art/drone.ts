/**
 * The combat drone: a machine that was never a person, drawn as one.
 *
 * Everything else that fights in the Sprawl is composed from the layered
 * character system — a body, a coat, a face. A drone has none of those,
 * and pretending otherwise is what made the old Static Drone a hooded
 * man with a breather. So its art is authored whole here, per view,
 * outside the layer engine: a rotor ring, an ovoid chrome hull, one
 * crimson camera eye, and the arc stinger slung under it.
 *
 * ## It still lives in the 32×48 frame
 *
 * Non-humanoid does not mean non-conforming. Drone grids honor the same
 * frame contract as ./layers/body — 32×48, anchored at (16, 44) on the
 * ground shadow — so depth sorting, hit flashes, status markers, camera
 * focus, and the reaction transforms in ./layers/hit all work on a
 * drone with no special cases anywhere. The chassis simply floats: it
 * occupies rows 17–35 with clear air between it and the shadow it casts
 * on rows 43–45, which is what reads as a hover.
 *
 * ## The sets
 *
 * - **idle** — four frames of hover bob (0, −1, −2, −1 px) with the
 *   rotor blur alternating phase, so the ring shimmers while the hull
 *   breathes. Frame count matches BODY_TIMING.idle.
 * - **walk** — eight frames of the same bob under a forward tilt: the
 *   ring and hull top lead, the stinger trails at half the shift. Two
 *   full bobs across the set, the second leaning a pixel further into
 *   the travel than the first, so a drone on the move never settles
 *   into one repeated pose. Frame count matches BODY_TIMING.walk.
 * - **attack** — four frames on the pistol timing (raise, settle, fire,
 *   lower): the chassis rears back onto its charge, throws the bolt on
 *   the impact beat, and settles. Frame count matches
 *   ATTACK_TIMING.pistol.
 * - **reactions** — not authored. A drone flinches and sparks out
 *   through reactionFrameGrid over its neutral grid, exactly like every
 *   body does, which is how its death stayed the spark-out the fight
 *   already knew (chassis: "machine" in ../../data/enemies).
 *
 * Frames are derived from two authored base grids per view (the rotor
 * blur is the only difference between them) by pure transforms, in the
 * same spirit as ./layers/bodyAnim: a bigger set is never a second set
 * of drawings.
 *
 * ## Channels
 *
 * Authored in fixed colors, not remap channels — a drone has no
 * appearance to recolor. Hull in the brushed-chrome ramp (6/T/9),
 * vents and grilles in charcoal, the camera eye in danger red (p) and
 * the stinger emitter in neon amber (m/n). Both of those are emissive,
 * so the eye and the charge keep their bite at every hour of the day.
 */
import { ATTACK_TIMING, type AttackClassId } from "../attack";
import { BODY_FRAME, type BodyViewId } from "./layers/body";
import { composeGrids } from "./layers";
import { rowsShifted, type PixelGrid } from "./pixel";
import { PORTRAIT_FRAME } from "./layers/portrait";

/** Authored drone chassis sets; content names one of these. */
export const DRONE_ART_IDS = ["static-drone"] as const;

export type DroneArtId = (typeof DRONE_ART_IDS)[number];

/** The frame sets a drone is animated from; reactions are derived. */
export const DRONE_SET_IDS = ["idle", "walk", "attack"] as const;

export type DroneSetId = (typeof DRONE_SET_IDS)[number];

const WIDTH = BODY_FRAME.width;
const HEIGHT = BODY_FRAME.height;
const BLANK = ".".repeat(WIDTH);

const gap = (n: number): string => ".".repeat(n);
const row = (left: number, body: string): string =>
  gap(left) + body + gap(WIDTH - left - body.length);
const rep = (n: number, r: string): string[] => Array<string>(n).fill(r);

/** Rows the chassis may travel over; the shadow below never moves. */
const CHASSIS_BOTTOM = 40;

/**
 * Tilt bands, top to bottom: the rotor ring leads a lean at full
 * travel, the hull follows at two thirds, the stinger trails at one —
 * three steps rather than two, so the lean shears instead of snapping.
 * Each entry is the last row of its band.
 */
const TILT_BANDS: readonly [number, number][] = [
  [19, 3],
  [27, 2],
  [CHASSIS_BOTTOM, 1],
];

/* --- The chassis, front (facing east). Rotor ring rows 17-19, hull
 * rows 20-31, camera eye rows 24-27, stinger rows 32-35, shadow 43-45.
 * Rows 0-16 and 36-42 are the air it hangs in. --- */

const ROTOR_A = row(5, "9.9.9.9.9.9.9.9.9.9.9");
const ROTOR_B = row(5, ".9.9.9.9.9.9.9.9.9.9.");

const ringTop = row(4, "0" + "999" + "T".repeat(17) + "66" + "0");
const ringUnder = row(5, "0" + "66" + "2".repeat(16) + "66" + "0");

const hullShoulders: readonly string[] = [
  row(11, "099TTTT660"),
  row(10, "09TTTTTTTT60"),
  row(9, "09TTTTTTTTTT60"),
  row(9, "09TTTTTTTTTT60"),
];

/** The camera eye: bezel, lens with a top-left glint, bezel. */
const eyeFront: readonly string[] = [
  row(9, "09T00000000T60"),
  row(9, "09T09ppppp0T60"),
  row(9, "09T0pppppp0T60"),
  row(9, "09T00pppp00T60"),
];

/** The back plate: cooling slits and a single amber tail lamp. */
const eyeBack: readonly string[] = [
  row(9, "09T22222222T60"),
  row(9, "09TTTTTTTTTT60"),
  row(9, "09T222mm222T60"),
  row(9, "09TTTTTTTTTT60"),
];

const hullBelly: readonly string[] = [
  row(9, "09T22222222T60"),
  row(10, "09TT2222TT60"),
  row(11, "09TTTTTT60"),
  row(12, "066TT660"),
];

/** The arc stinger, slung right of center so it reads as aimed. */
const stingerFront: readonly string[] = [
  row(15, "0TT0"),
  row(15, "06T0"),
  row(15, "0mm0"),
  row(16, "00"),
];

/** From behind, the emitter is on the far side: chrome, no charge. */
const stingerBack: readonly string[] = [
  row(15, "0TT0"),
  row(15, "06T0"),
  row(15, "0660"),
  row(16, "00"),
];

/** Hover shadow: small and soft, the whole chassis being off the deck. */
const shadow: readonly string[] = [
  row(12, "z".repeat(8)),
  row(10, "z".repeat(12)),
  row(12, "z".repeat(8)),
];

function chassis(
  rotor: string,
  eye: readonly string[],
  stinger: readonly string[],
): PixelGrid {
  return [
    ...rep(17, BLANK),
    rotor,
    ringTop,
    ringUnder,
    ...hullShoulders,
    ...eye,
    ...hullBelly,
    ...stinger,
    ...rep(7, BLANK),
    ...shadow,
    ...rep(2, BLANK),
  ];
}

/** Base grids per view; the two rotor phases are the only difference. */
const BASE: Readonly<Record<BodyViewId, readonly [PixelGrid, PixelGrid]>> = {
  front: [
    chassis(ROTOR_A, eyeFront, stingerFront),
    chassis(ROTOR_B, eyeFront, stingerFront),
  ],
  back: [
    chassis(ROTOR_A, eyeBack, stingerBack),
    chassis(ROTOR_B, eyeBack, stingerBack),
  ],
};

/* --- Overlays: what the stinger does when it fires. Full-frame grids
 * composed over the chassis, so charge and discharge cost no second
 * drawing of the drone. --- */

function overlay(rows: Readonly<Record<number, string>>): PixelGrid {
  return Array.from({ length: HEIGHT }, (_, r) => rows[r] ?? BLANK);
}

/** Charge gathering at the emitter, before the bolt leaves. */
const CHARGE = overlay({
  33: row(14, "m....m"),
  34: row(13, "m......m"),
  35: row(15, "mnnm"),
  36: row(16, "nn"),
});

/** The bolt leaving: the frame the impact beat is scheduled against. */
const DISCHARGE = overlay({
  34: row(13, "m......m"),
  35: row(14, "mnnnnm"),
  36: row(13, "mnnnnnnm"),
  37: row(15, "nmmn"),
  38: row(16, "mm"),
});

/* --- Pure frame transforms. Every one leaves the shadow rows and the
 * (16, 44) anchor alone, so no frame can drift the drone off its
 * tile. --- */

/** The chassis raised or lowered; negative dy is up. */
function hovered(grid: PixelGrid, dy: number): string[] {
  if (dy === 0) return [...grid];
  return grid.map((rowText, r) =>
    r <= CHASSIS_BOTTOM ? (grid[r - dy] ?? BLANK) : rowText,
  );
}

/**
 * A forward tilt: each band shifts by its share of `dx`, so the ring
 * leads and the stinger trails. `dx` is the ring's travel; a band's
 * share is scaled by its weight out of three.
 */
function tilted(grid: PixelGrid, dx: number): string[] {
  if (dx === 0) return [...grid];
  let out: PixelGrid = grid;
  let top = 0;
  for (const [bottom, weight] of TILT_BANDS) {
    out = rowsShifted(out, top, bottom, Math.round((dx * weight) / 3));
    top = bottom + 1;
  }
  return [...out];
}

function lit(grid: PixelGrid, glow: PixelGrid | null): PixelGrid {
  return glow === null ? grid : composeGrids([{ grid }, { grid: glow }], BODY_FRAME);
}

/** One derived frame: which rotor phase, how high, how far tilted. */
interface DroneFrameSpec {
  readonly rotor: 0 | 1;
  readonly dy: number;
  readonly dx: number;
  readonly glow?: PixelGrid;
}

/** Hover bob under a still ring. */
const IDLE_SPEC: readonly DroneFrameSpec[] = [
  { rotor: 0, dy: 0, dx: 0 },
  { rotor: 1, dy: -1, dx: 0 },
  { rotor: 0, dy: -2, dx: 0 },
  { rotor: 1, dy: -1, dx: 0 },
];

/** Travel: the same bob, leaning into it. */
const WALK_SPEC: readonly DroneFrameSpec[] = [
  { rotor: 0, dy: 0, dx: 2 },
  { rotor: 1, dy: -1, dx: 2 },
  { rotor: 0, dy: -2, dx: 3 },
  { rotor: 1, dy: -1, dx: 3 },
  { rotor: 0, dy: 0, dx: 3 },
  { rotor: 1, dy: -1, dx: 3 },
  { rotor: 0, dy: -2, dx: 2 },
  { rotor: 1, dy: -1, dx: 2 },
];

/** Raise, rear back onto the charge, throw it, settle. */
const ATTACK_SPEC: readonly DroneFrameSpec[] = [
  { rotor: 0, dy: -1, dx: 0 },
  { rotor: 1, dy: -2, dx: -1, glow: CHARGE },
  { rotor: 0, dy: -1, dx: 1, glow: DISCHARGE },
  { rotor: 1, dy: 0, dx: 1 },
];

const SPECS: Readonly<Record<DroneSetId, readonly DroneFrameSpec[]>> = {
  idle: IDLE_SPEC,
  walk: WALK_SPEC,
  attack: ATTACK_SPEC,
};

function frames(view: BodyViewId, set: DroneSetId): PixelGrid[] {
  return SPECS[set].map((spec) =>
    lit(
      tilted(hovered(BASE[view][spec.rotor], spec.dy), spec.dx),
      spec.glow ?? null,
    ),
  );
}

/* --- The portrait: the same machine, close enough to see what is
 * looking back. Authored at the 48×48 portrait frame, cropped like a
 * bust with the stinger running out of the bottom. --- */

const PW = PORTRAIT_FRAME.width;
const PBLANK = ".".repeat(PW);
const pgap = (n: number): string => ".".repeat(n);
const prow = (left: number, body: string): string =>
  pgap(left) + body + pgap(PW - left - body.length);
const hull = (left: number, lit9: number, base: number, shade: number): string =>
  prow(left, "0" + "9".repeat(lit9) + "T".repeat(base) + "6".repeat(shade) + "0");
/** A lens row: 20 painted pixels inside the bezel, inside the hull. */
const lens = (inner: string): string =>
  prow(7, "0999TT0" + inner + "0TT6660");

const DRONE_PORTRAIT: PixelGrid = [
  ...rep(5, PBLANK),
  prow(4, "9.".repeat(19) + "9"),
  prow(3, "0" + "9".repeat(4) + "T".repeat(32) + "6".repeat(4) + "0"),
  prow(3, "0" + "6" + "2".repeat(38) + "6" + "0"),
  hull(11, 3, 18, 3),
  hull(9, 3, 22, 3),
  hull(8, 3, 24, 3),
  hull(7, 3, 26, 3),
  hull(7, 3, 26, 3),
  hull(7, 3, 26, 3),
  hull(7, 3, 26, 3),
  prow(7, "0999TT" + "0".repeat(22) + "TT6660"),
  lens("9999" + "p".repeat(16)),
  lens("99" + "p".repeat(18)),
  lens("9" + "p".repeat(19)),
  lens("p".repeat(20)),
  lens("p".repeat(20)),
  lens("p".repeat(20)),
  lens("p".repeat(20)),
  lens("p".repeat(20)),
  lens("p".repeat(17) + "000"),
  prow(7, "0999TT" + "0".repeat(22) + "TT6660"),
  hull(7, 3, 26, 3),
  hull(7, 3, 26, 3),
  prow(7, "0999TT" + "2".repeat(22) + "TT6660"),
  hull(7, 3, 26, 3),
  prow(7, "0999TT" + "2".repeat(22) + "TT6660"),
  hull(7, 3, 26, 3),
  hull(8, 3, 24, 3),
  hull(9, 3, 22, 3),
  hull(11, 3, 18, 3),
  prow(14, "0" + "6".repeat(2) + "T".repeat(16) + "6".repeat(2) + "0"),
  prow(18, "0" + "6".repeat(12) + "0"),
  prow(21, "0TTTT0"),
  prow(21, "06TT60"),
  prow(21, "06TT60"),
  prow(21, "06TT60"),
  prow(22, "0mm0"),
  prow(22, "0mm0"),
  prow(22, "0nn0"),
  prow(23, "nn"),
  prow(23, "nn"),
  prow(23, "mm"),
  prow(23, "mm"),
];

/** One authored drone chassis: its frames, its reach, and its face. */
export interface DroneArt {
  /** Attack animation the chassis swings; pins its attack frame count. */
  readonly attackClass: AttackClassId;
  /** Derived frame sets per authored view. */
  readonly frames: Readonly<
    Record<BodyViewId, Readonly<Record<DroneSetId, readonly PixelGrid[]>>>
  >;
  /** Resting grid per view; reaction transforms fold this one. */
  readonly neutral: Readonly<Record<BodyViewId, PixelGrid>>;
  /**
   * Where the bolt leaves, in 1x art pixels of the authored (unflipped)
   * frame — the stinger emitter on the discharge frame. Mirrors with the
   * figure on the south and west facings, like every muzzle does.
   */
  readonly muzzle: { readonly x: number; readonly y: number };
  /** 48×48 portrait grid; the initiative rail's face for a machine. */
  readonly portrait: PixelGrid;
}

function droneArt(): DroneArt {
  const setsFor = (
    view: BodyViewId,
  ): Readonly<Record<DroneSetId, readonly PixelGrid[]>> => ({
    idle: frames(view, "idle"),
    walk: frames(view, "walk"),
    attack: frames(view, "attack"),
  });
  return {
    attackClass: "pistol",
    frames: { front: setsFor("front"), back: setsFor("back") },
    neutral: { front: BASE.front[0], back: BASE.back[0] },
    muzzle: { x: 18, y: 36 },
    portrait: DRONE_PORTRAIT,
  };
}

/** Every authored drone chassis, by id. */
export const DRONE_ART: Readonly<Record<DroneArtId, DroneArt>> = {
  "static-drone": droneArt(),
};

/** How many frames a set has; pinned against the shared timings. */
export function droneFrameCount(id: DroneArtId, set: DroneSetId): number {
  return DRONE_ART[id].frames.front[set].length;
}

/** The attack timing a chassis swings on — its class's, like anyone's. */
export function droneAttackTiming(id: DroneArtId): {
  readonly frameMs: readonly number[];
} {
  return ATTACK_TIMING[DRONE_ART[id].attackClass];
}
