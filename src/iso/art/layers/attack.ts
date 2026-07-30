/**
 * Attack animation for the layered character: the one-shot pose set a
 * combatant plays when it swings, authored per attack class (the five
 * held-weapon silhouettes plus bare hands) and derived — like the walk
 * and idle loops — by pure transforms over the composed neutral pose
 * rather than hand-drawn duplicate bodies.
 *
 * ## What a frame is
 *
 * Each frame is three authored numbers plus a stroke set:
 *
 * - `handDx/handDy` reach the weapon-side fist out of its resting hip
 *   window (BODY_FRAME.hands) to where the swing puts it. The fist
 *   pixels travel with whatever is painted on them — a chrome arm
 *   overlay rides along — and a fabric sleeve fills in behind them,
 *   only into pixels the body left empty, so the torso is never
 *   painted over.
 * - `leanX` shifts the whole upper body (and everything it is holding)
 *   toward the target on the commit frames and away on the wind-up.
 *   Negative is away, positive is into the blow.
 * - `sink` drops the body one pixel on the frames that land weight,
 *   compressing the bottom boot row so the feet stay planted.
 * - The stroke set is the weapon itself, drawn where that frame's fist
 *   puts it — the weapon layer is part of the attack set, not the
 *   resting silhouette translated around.
 *
 * Legs, feet, and the ground shadow are never touched by the arm or
 * lean transforms, and the sink keeps row 42 a boot row, so an attack
 * cannot slide the character off its tile: the (16, 44) anchor holds
 * for every frame of every class.
 *
 * ## Views and builds
 *
 * Strokes are authored once per class per frame at the lean build's
 * hand window and shift one column out for the heavy build, exactly as
 * the resting weapon layers do (BUILD_SHIFT in ./weapons) — per-build
 * alignment by construction. The back view derives from the front by
 * dimming the camera-facing light: speculars drop to the material base
 * and the bright energy/flash steps cool one stop, the same
 * relationship the authored resting pairs already have. South and west
 * facings mirror the whole composed frame, as everywhere else.
 *
 * ## Region contract
 *
 * Every weapon pixel of every attack frame stays inside
 * ATTACK_WEAPON_REGION — above the hips so the lean shifts weapon and
 * torso as one piece, and inside the frame edges with room for the
 * heavy build's column shift and the mirrored facings.
 *
 * Channels match the resting weapon layers (chrome 6/T/9, the
 * outfit-accent energy ramp l/j/k, outline 0 / ink 1) plus the neon
 * amber pair m/n for muzzle flash — fire is its own light, not a
 * material, so it deliberately sits outside the accent remap.
 */
import type { Facing } from "../../animation";
import type { AttackClassId } from "../../attack";
import { ATTACK_TIMING, attackFrameCount } from "../../attack";
import { rowsShifted, type PixelGrid } from "../pixel";
import {
  BODY_FRAME,
  bodyViewForFacing,
  type BodyBuildId,
  type BodyViewId,
} from "./body";

/**
 * Rows/cols (inclusive) an attack frame's weapon pixels may occupy.
 * The bottom stops at the hip line so the lean moves the weapon with
 * the torso instead of shearing it; the top leaves the skull clear for
 * overhead wind-ups to pass beside rather than across the head.
 */
export const ATTACK_WEAPON_REGION = {
  top: 10,
  bottom: 30,
  left: 2,
  right: 29,
} as const;

/** Fabric channel the sleeve fills with: base cloth, shaded outer edge. */
const SLEEVE_BASE = "W";
const SLEEVE_SHADE = "V";
const OUTLINE = "0";

/** Rows the upper-body lean shifts; row 31 (the hips) and below hold. */
const LEAN_BOTTOM = 30;
/** Rows the sink moves; matches bodyAnim's planted-feet compression. */
const FOOT_ROW = 42;

const WIDTH = BODY_FRAME.width;
const gap = (n: number): string => ".".repeat(n);
const BLANK = gap(WIDTH);

/** One authored weapon mark: [row, leftmost column, pixels]. */
type Stroke = readonly [number, number, string];

/** One frame of a class's attack: the body pose plus the weapon art. */
export interface AttackFrame {
  /** Upper-body shift toward the target (negative winds away). */
  readonly leanX: number;
  /** Weapon-side fist displacement from its resting hip window. */
  readonly handDx: number;
  readonly handDy: number;
  /** Drop the body one pixel: the frames that land weight. */
  readonly sink?: boolean;
  /** The weapon as it is held on this frame; empty for bare hands. */
  readonly strokes: readonly Stroke[];
}

/* --- Unarmed: a straight jab. The fist pulls back off the hip, is
 * thrown forward at chest height with the body behind it, and drops
 * back toward the guard. Nothing is held, so the fist is the art. --- */

const unarmedFrames: readonly AttackFrame[] = [
  { leanX: -1, handDx: -2, handDy: -3, strokes: [] },
  { leanX: 2, handDx: 5, handDy: -6, sink: true, strokes: [] },
  { leanX: 1, handDx: 1, handDy: -1, strokes: [] },
];

/* --- Blade: a swing arc. The knife rises past the weapon-side
 * shoulder, hangs vertical at the top of the wind, cuts down and
 * forward through the target, follows through low past the hip, and
 * comes back to the ready angle. --- */

const bladeFrames: readonly AttackFrame[] = [
  {
    leanX: -1,
    handDx: 1,
    handDy: -6,
    strokes: [
      [23, 21, "66"],
      [22, 23, "T9"],
      [21, 24, "T9"],
      [20, 25, "T9"],
      [19, 26, "T9"],
    ],
  },
  {
    leanX: -2,
    handDx: 3,
    handDy: -10,
    strokes: [
      [19, 23, "66"],
      [18, 24, "T9"],
      [17, 24, "T9"],
      [16, 24, "T9"],
      [15, 24, "T9"],
    ],
  },
  {
    leanX: 2,
    handDx: 4,
    handDy: -4,
    sink: true,
    strokes: [
      [26, 24, "66"],
      [27, 26, "T9"],
      [28, 27, "T9"],
    ],
  },
  {
    leanX: 2,
    handDx: 3,
    handDy: 0,
    strokes: [
      [29, 23, "66"],
      [30, 25, "TT9"],
    ],
  },
  {
    leanX: 0,
    handDx: 1,
    handDy: -1,
    strokes: [
      [28, 22, "66"],
      [27, 23, "T9"],
      [26, 24, "T9"],
      [25, 25, "T9"],
    ],
  },
];

/* --- Baton: an overhead chop. The shock rod comes up beside the
 * shoulder, tips back at the top of the wind, and drives down and
 * forward with the crackling tip leading.
 *
 * At rest the rod hangs edge-on at the hip and is authored almost
 * entirely in ink (see batonFront in ./weapons) — a matte shaft with a
 * live tip. Swung, that same shaft would vanish against the dark body
 * it crosses, so the moving frames carry it in chrome (lit column
 * leading, T over 6) and keep the ink for the grip. Same weapon, turned
 * into the light. --- */

const batonFrames: readonly AttackFrame[] = [
  {
    leanX: -1,
    handDx: 0,
    handDy: -8,
    strokes: [
      [21, 21, "16"],
      [20, 22, "T6"],
      [19, 22, "T6"],
      [18, 22, "Tj"],
      [17, 22, "jk"],
    ],
  },
  {
    leanX: -2,
    handDx: 2,
    handDy: -11,
    strokes: [
      [18, 23, "16"],
      [17, 24, "T6"],
      [16, 24, "T6"],
      [15, 24, "Tj"],
      [14, 24, "jk"],
    ],
  },
  {
    leanX: 2,
    handDx: 3,
    handDy: -2,
    sink: true,
    strokes: [
      [27, 23, "16"],
      [28, 25, "T6"],
      [29, 26, "Tj"],
      [30, 27, "jk"],
    ],
  },
  {
    leanX: 0,
    handDx: 1,
    handDy: 0,
    strokes: [
      [29, 22, "6"],
      [30, 23, "T6j"],
    ],
  },
];

/* --- Pistol: raise and recoil. The sidearm comes up off the hip to
 * eye line, extends onto the sights, fires with the slide back and the
 * muzzle lit, then settles. The body kicks away from the shot rather
 * than into it. --- */

const pistolFrames: readonly AttackFrame[] = [
  {
    leanX: 0,
    handDx: 1,
    handDy: -4,
    strokes: [
      [25, 22, "TTT9"],
      [26, 22, "6T"],
    ],
  },
  {
    leanX: 1,
    handDx: 2,
    handDy: -5,
    strokes: [
      [24, 23, "TTTT9"],
      [25, 23, "6T"],
    ],
  },
  {
    leanX: -1,
    handDx: 2,
    handDy: -6,
    strokes: [
      [23, 23, "TTTT9"],
      [24, 23, "6T"],
      [22, 28, "m"],
      [23, 28, "n"],
      [24, 28, "m"],
    ],
  },
  {
    leanX: 0,
    handDx: 1,
    handDy: -3,
    strokes: [
      [26, 22, "TTT9"],
      [27, 22, "6T"],
    ],
  },
];

/* --- Rifle: shoulder and fire. The long gun swings up out of the
 * across-the-chest carry, levels with the stock in the shoulder
 * pocket, steadies, fires with the whole weapon driven back a column,
 * and lowers. --- */

const rifleFrames: readonly AttackFrame[] = [
  {
    leanX: 0,
    handDx: 0,
    handDy: -3,
    strokes: [
      [19, 26, "T9"],
      [20, 25, "T9"],
      [21, 24, "T9"],
      [22, 23, "T9"],
      [23, 22, "T9"],
      [24, 21, "6T"],
      [25, 20, "16"],
      [26, 19, "1"],
      [27, 18, "1"],
      [28, 17, "11"],
    ],
  },
  {
    leanX: 1,
    handDx: 1,
    handDy: -6,
    strokes: [
      [23, 22, "TTTTT9"],
      [24, 20, "66T"],
      [25, 17, "111"],
    ],
  },
  {
    leanX: 1,
    handDx: 1,
    handDy: -7,
    strokes: [
      [22, 22, "TTTTT9"],
      [23, 20, "66T"],
      [24, 17, "111"],
    ],
  },
  {
    leanX: -2,
    handDx: 0,
    handDy: -7,
    strokes: [
      [22, 21, "TTTTT9"],
      [23, 19, "66T"],
      [24, 16, "111"],
      [21, 27, "m"],
      [22, 27, "n"],
      [23, 27, "m"],
    ],
  },
  {
    leanX: 0,
    handDx: 1,
    handDy: -5,
    strokes: [
      [24, 22, "TTTTT9"],
      [25, 20, "66T"],
      [26, 17, "111"],
    ],
  },
];

/* --- Lash: the live cable. The spool draws back, the cable arcs up
 * behind the shoulder, is thrown forward, cracks out past the target
 * with the tip at its brightest, and reels back in.
 *
 * The cable is one pixel thick and crosses the character's own dark
 * torso, so its ramp sits a stop above the resting coil's (./weapons):
 * a whip in motion is live down its whole length, and the dull end of
 * the accent ramp would simply vanish against the body. Each frame's
 * marks step one column at a time so the cable reads as a line rather
 * than a scatter of sparks. --- */

const lashFrames: readonly AttackFrame[] = [
  {
    leanX: -1,
    handDx: -1,
    handDy: -3,
    strokes: [
      [26, 19, "66"],
      [27, 19, "T6"],
      [28, 18, "j"],
      [29, 17, "k"],
      [30, 16, "kj"],
    ],
  },
  {
    leanX: -2,
    handDx: -2,
    handDy: -6,
    strokes: [
      [23, 18, "66"],
      [24, 18, "T6"],
      [22, 17, "j"],
      [21, 16, "k"],
      [20, 14, "kj"],
    ],
  },
  {
    leanX: 1,
    handDx: 2,
    handDy: -4,
    strokes: [
      [25, 22, "66"],
      [26, 22, "T6"],
      [26, 24, "j"],
      [27, 25, "k"],
      [28, 26, "kk"],
    ],
  },
  {
    leanX: 2,
    handDx: 4,
    handDy: -2,
    sink: true,
    strokes: [
      [27, 24, "66"],
      [28, 24, "T6"],
      [26, 26, "j"],
      [25, 27, "k"],
      [24, 27, "kk"],
    ],
  },
  {
    leanX: 0,
    handDx: 1,
    handDy: -1,
    strokes: [
      [28, 21, "66"],
      [29, 21, "T6"],
      [30, 23, "j"],
    ],
  },
];

/** The authored attack sets, one per class. */
export const ATTACK_FRAMES: Readonly<
  Record<AttackClassId, readonly AttackFrame[]>
> = {
  unarmed: unarmedFrames,
  blade: bladeFrames,
  baton: batonFrames,
  pistol: pistolFrames,
  rifle: rifleFrames,
  lash: lashFrames,
};

/**
 * Lit-edge steps that lose a stop when the character is seen from
 * behind: the chrome specular flattens to the material base, and the
 * bright ends of the energy and muzzle-flash ramps cool one step. Same
 * relationship the resting weapon layers' authored front/back pairs
 * have — the lit edge simply faces away.
 */
const BACK_DIM: Readonly<Record<string, string>> = {
  "9": "T",
  k: "j",
  n: "m",
};

const dimmed = (pixels: string): string =>
  [...pixels].map((ch) => BACK_DIM[ch] ?? ch).join("");

/**
 * The lean hand window's left column; heavy frames shift one column out
 * so the grip stays on the fist for both builds (matching ./weapons).
 */
const BUILD_SHIFT: Readonly<Record<BodyBuildId, number>> = {
  lean: 0,
  heavy: BODY_FRAME.hands.heavy.right[0] - BODY_FRAME.hands.lean.right[0],
};

/**
 * A frame-sized grid from strokes, shifted dx columns and dimmed for
 * the back view. Unlike the resting weapon builder this overlays rather
 * than replaces rows, so one frame may mark the same row from several
 * strokes (a barrel and the flash past its muzzle).
 */
function strokeGrid(
  strokes: readonly Stroke[],
  dx: number,
  view: BodyViewId,
): string[] {
  const rows = Array.from({ length: BODY_FRAME.height }, () => [...BLANK]);
  for (const [y, left, pixels] of strokes) {
    const cells = rows[y];
    if (!cells) continue;
    const art = view === "back" ? dimmed(pixels) : pixels;
    for (let i = 0; i < art.length; i++) {
      const ch = art[i] ?? ".";
      const x = left + dx + i;
      if (ch !== "." && x >= 0 && x < WIDTH) cells[x] = ch;
    }
  }
  return rows.map((cells) => cells.join(""));
}

/**
 * Every attack frame's weapon art, baked once at module load per class,
 * build, and view — the same eager shape the resting weapon registry
 * uses, so validation tests can walk all of it.
 */
function classGrids(
  id: AttackClassId,
): Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, readonly PixelGrid[]>>>> {
  const perBuild = (build: BodyBuildId): Record<BodyViewId, PixelGrid[]> => {
    const perView = (view: BodyViewId): PixelGrid[] =>
      ATTACK_FRAMES[id].map((frame) =>
        strokeGrid(frame.strokes, BUILD_SHIFT[build], view),
      );
    return { front: perView("front"), back: perView("back") };
  };
  return { lean: perBuild("lean"), heavy: perBuild("heavy") };
}

export const ATTACK_WEAPON_GRIDS: Readonly<
  Record<
    AttackClassId,
    Readonly<Record<BodyBuildId, Readonly<Record<BodyViewId, readonly PixelGrid[]>>>>
  >
> = {
  unarmed: classGrids("unarmed"),
  blade: classGrids("blade"),
  baton: classGrids("baton"),
  pistol: classGrids("pistol"),
  rifle: classGrids("rifle"),
  lash: classGrids("lash"),
};

/** Overwrite one cell of a row array of strings. */
function setCell(rows: string[], r: number, c: number, ch: string): void {
  if (r < 0 || r >= rows.length || c < 0 || c >= WIDTH) return;
  const row = rows[r] ?? BLANK;
  rows[r] = row.slice(0, c) + ch + row.slice(c + 1);
}

/** Paint a cell only where nothing has been drawn yet. */
function fillIfEmpty(rows: string[], r: number, c: number, ch: string): void {
  if (r < 0 || r >= rows.length || c < 0 || c >= WIDTH) return;
  if ((rows[r] ?? BLANK)[c] !== ".") return;
  setCell(rows, r, c, ch);
}

/**
 * Reach the weapon-side fist out to (dx, dy) from its resting window:
 * a sleeve fills the empty pixels along the way, base garb closes over
 * the vacated hip, the fist pixels themselves move (carrying whatever
 * layer painted on them), and an outline traces the fist wherever it
 * now hangs in open air.
 */
function armReached(
  grid: PixelGrid,
  build: BodyBuildId,
  dx: number,
  dy: number,
): string[] {
  const out = [...grid];
  if (dx === 0 && dy === 0) return out;
  const hands = BODY_FRAME.hands[build];
  const [top = 29, bottom = 30] = hands.rows;
  const [inner = 20, outer = 21] = hands.right;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i++) {
    const sx = Math.round((dx * i) / steps);
    const sy = Math.round((dy * i) / steps);
    for (const r of [top, bottom]) {
      fillIfEmpty(out, r + sy, inner + sx, SLEEVE_BASE);
      fillIfEmpty(out, r + sy, outer + sx, SLEEVE_SHADE);
    }
  }
  for (const r of [top, bottom]) {
    for (const c of [inner, outer]) setCell(out, r, c, SLEEVE_BASE);
  }
  for (const r of [top, bottom]) {
    for (const c of [inner, outer]) {
      const ch = grid[r]?.[c] ?? ".";
      if (ch !== ".") setCell(out, r + dy, c + dx, ch);
    }
  }
  // Trace the reached fist so it reads as a shape against open air.
  for (const c of [inner - 1, inner, outer, outer + 1]) {
    fillIfEmpty(out, top + dy - 1, c + dx, OUTLINE);
    fillIfEmpty(out, bottom + dy + 1, c + dx, OUTLINE);
  }
  for (const r of [top + dy, bottom + dy]) {
    fillIfEmpty(out, r, inner + dx - 1, OUTLINE);
    fillIfEmpty(out, r, outer + dx + 1, OUTLINE);
  }
  return out;
}

/** Upper body (and everything it holds) shifted toward the target. */
function leaned(grid: PixelGrid, dx: number): string[] {
  return dx === 0 ? [...grid] : rowsShifted(grid, 0, LEAN_BOTTOM, dx);
}

/** Body down one pixel; the bottom boot row compresses, feet planted. */
function sunk(grid: PixelGrid): string[] {
  const out = [...grid];
  for (let r = FOOT_ROW; r > 3; r--) out[r] = grid[r - 1] ?? BLANK;
  out[3] = BLANK;
  return out;
}

/** The authored frame, or a clear error naming the class's real count. */
function requireFrame(attackClass: AttackClassId, frame: number): AttackFrame {
  const authored = ATTACK_FRAMES[attackClass][frame];
  if (!authored) {
    throw new Error(
      `no ${attackClass} attack frame ${frame} (have ${attackFrameCount(attackClass)})`,
    );
  }
  return authored;
}

/**
 * The weapon art for one attack frame, or null when the class holds
 * nothing on it (bare hands) — callers then draw the posed body alone.
 */
export function attackWeaponGrid(
  attackClass: AttackClassId,
  build: BodyBuildId,
  view: BodyViewId,
  frame: number,
): PixelGrid | null {
  if (requireFrame(attackClass, frame).strokes.length === 0) return null;
  return ATTACK_WEAPON_GRIDS[attackClass][build][view][frame] ?? null;
}

/**
 * Reach a composed neutral character's weapon arm into one attack
 * frame. The weapon layer is left out of `base` — the attack set draws
 * its own — and composed on afterwards, before attackFrameShift moves
 * body and weapon together.
 */
export function attackArmPose(
  base: PixelGrid,
  build: BodyBuildId,
  attackClass: AttackClassId,
  frame: number,
): PixelGrid {
  const authored = requireFrame(attackClass, frame);
  return armReached(base, build, authored.handDx, authored.handDy);
}

/**
 * The whole-figure motion of one attack frame — the upper-body lean and
 * the landed weight — applied to the composed character with its weapon
 * already on it, so the two never drift apart by a pixel. Legs, feet,
 * and the anchored shadow are untouched.
 */
export function attackFrameShift(
  grid: PixelGrid,
  attackClass: AttackClassId,
  frame: number,
): PixelGrid {
  const authored = requireFrame(attackClass, frame);
  const tilted = leaned(grid, authored.leanX);
  return authored.sink === true ? sunk(tilted) : tilted;
}

/**
 * Where a class's blow leaves the character: the art pixel a shot is
 * fired from, on the frame the class fires (ATTACK_TIMING.impactFrame).
 *
 * Authored at the lean build's hand window in the front view, exactly
 * like the strokes themselves, and pinned by a test to the flash pixel
 * the frame already lights there — so the tracer starts at the same
 * muzzle the sprite's own fire frame burns at, not near it.
 *
 * Classes that fire nothing carry no point: their blow leaves the fist,
 * which the hand contract (BODY_FRAME.hands plus the frame's own reach)
 * already says where to find.
 */
export const MUZZLE_POINTS: Readonly<
  Partial<Record<AttackClassId, { readonly x: number; readonly y: number }>>
> = {
  pistol: { x: 28, y: 23 },
  rifle: { x: 27, y: 22 },
};

/**
 * The muzzle (or the fist) on a class's impact frame, in art pixels of
 * the front view, with the frame's own lean and landed weight applied —
 * the same transforms attackFrameShift moves the drawn weapon by, so
 * the point tracks the picture rather than the un-shifted strokes.
 */
function muzzleArtPoint(
  attackClass: AttackClassId,
  build: BodyBuildId,
): { x: number; y: number } {
  const frame = requireFrame(attackClass, ATTACK_TIMING[attackClass].impactFrame);
  const authored = MUZZLE_POINTS[attackClass];
  const hands = BODY_FRAME.hands[build];
  const [, outer = 21] = hands.right;
  const [, bottom = 30] = hands.rows;
  const base = authored
    ? { x: authored.x + BUILD_SHIFT[build], y: authored.y }
    : { x: outer + frame.handDx, y: bottom + frame.handDy };
  return {
    x: base.x + frame.leanX,
    y: base.y + (frame.sink === true ? 1 : 0),
  };
}

/**
 * Where a facing puts the muzzle, in art pixels of the composed frame.
 * South and west mirror the whole figure (see bodyViewForFacing), so the
 * muzzle mirrors with it: a gun fired east leaves the frame's right
 * edge, the same gun fired west leaves its left.
 */
export function muzzlePoint(
  attackClass: AttackClassId,
  build: BodyBuildId,
  facing: Facing,
): { x: number; y: number } {
  const { x, y } = muzzleArtPoint(attackClass, build);
  const { flip } = bodyViewForFacing(facing);
  return { x: flip ? BODY_FRAME.width - 1 - x : x, y };
}
