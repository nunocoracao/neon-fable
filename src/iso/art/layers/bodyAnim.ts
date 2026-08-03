/**
 * Hi-res base-body animation: 6-frame walk and 4-frame idle sets for
 * both builds and both authored views, derived from BODY_GRIDS by pure
 * row and column-band transforms rather than hand-drawn duplicates.
 *
 * ## Walk (contact → recoil → passing → reach, then the mirrored stride)
 *
 * The four poses of a walk cycle, per stride half. Each half shears the
 * two leg bands from the standing pose — the lead leg swings forward
 * (+x), the trailing leg back — with the arms counter-swinging
 * (trail-side hand up in front of the belt, lead hand down onto the
 * hip). The second half swaps which leg leads, so the loop is seamless
 * and lighting stays authored (no whole-row mirroring).
 *
 * - **Contact**: the stride at full extension, both feet down.
 * - **Recoil**: weight lands, the whole body sinks one pixel (bottom
 *   boot row compresses, feet stay planted). The low point.
 * - **Passing**: the swing leg tucks under the body and lifts its foot
 *   clear; the planted leg carries the body at standing height.
 * - **Reach**: the swing leg is out in front and the body rides one
 *   pixel up over the straightened support leg. The high point, and
 *   where the arms have already begun the next half's counter-swing.
 *
 * That is one rise and fall per step (0, −1, 0, +1) rather than the
 * single bob the older three-pose half could describe.
 *
 * Foot treadmill (bottom-row dx from a leg's own hip): +2, +1, 0 while
 * planted, then −2, −2, −3 and lift — monotonically backward under the
 * advancing body, so feet never slide forward while grounded.
 *
 * ## Idle (4-frame breathing)
 *
 * Neutral → chest rise (shoulder line climbs one row over the neck) →
 * peak (head and neck ride one pixel up as well) → settle (the rise
 * frame again). Feet, hips, and the ground shadow never move.
 *
 * Every transform leaves the shadow rows and the (16, 44) anchor
 * untouched, so frames never drift against the ground.
 */
import type { LoopState } from "../../animation";
import type { PixelGrid } from "../pixel";
import {
  BODY_FRAME,
  BODY_GRIDS,
  type BodyBuildId,
  type BodyViewId,
} from "./body";

type Side = "left" | "right";

/** Leg column bands (inclusive, outline included) per build. */
const LEG_BANDS = {
  lean: { left: [9, 14], right: [17, 22] },
  heavy: { left: [8, 14], right: [17, 23] },
} as const;

/** Rows the leg bands may shear or lift over (below hip and crotch). */
const LEG_TOP = 33;
const FOOT_ROW = 42;

/** Stride shear per row group: [thigh 33–35, shin 36–38, foot 39–42]. */
type StrideSteps = readonly [number, number, number];

const CONTACT_STEPS: StrideSteps = [0, 1, 2];
/** At recoil the body has advanced: both feet shift one back. */
const RECOIL_LEAD_STEPS: StrideSteps = [0, 0, 1];
const RECOIL_REAR_STEPS: StrideSteps = [1, 2, 3];
/**
 * Reach: the swing leg is out in front of the body but has not landed,
 * so it is short of the contact extension; the support leg has already
 * swung back to where it will stand at the next contact.
 */
const REACH_LEAD_STEPS: StrideSteps = [0, 0, 1];
const REACH_REAR_STEPS: StrideSteps = [0, 1, 2];

const BLANK = ".".repeat(BODY_FRAME.width);

const other = (side: Side): Side => (side === "left" ? "right" : "left");

const stepAt = (steps: StrideSteps, r: number): number =>
  steps[r <= 35 ? 0 : r <= 38 ? 1 : 2];

/** Overwrite one cell of a row array of strings. */
function setCell(rows: string[], r: number, c: number, ch: string): void {
  const row = rows[r] ?? BLANK;
  rows[r] = row.slice(0, c) + ch + row.slice(c + 1);
}

function clearBand(cells: string[], band: readonly [number, number]): void {
  for (let c = band[0]; c <= band[1]; c++) cells[c] = ".";
}

/** Paint non-transparent chars onto cells starting at col. */
function overlay(cells: string[], col: number, chars: string): void {
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? ".";
    if (ch !== ".") cells[col + i] = ch;
  }
}

/**
 * Shear the leg bands into a stride: lead band rows shift +stepAt,
 * rear band rows −stepAt. The far (left-band) leg repaints first so
 * the near leg wins where strides cross on screen.
 */
function stridedLegs(
  grid: PixelGrid,
  build: BodyBuildId,
  lead: Side,
  leadSteps: StrideSteps,
  rearSteps: StrideSteps,
): string[] {
  const bands = LEG_BANDS[build];
  const out = [...grid];
  for (let r = LEG_TOP; r <= FOOT_ROW; r++) {
    const row = out[r] ?? BLANK;
    const dx = (side: Side): number =>
      side === lead ? stepAt(leadSteps, r) : -stepAt(rearSteps, r);
    const cells = [...row];
    clearBand(cells, bands.left);
    clearBand(cells, bands.right);
    overlay(cells, bands.left[0] + dx("left"), row.slice(bands.left[0], bands.left[1] + 1));
    overlay(cells, bands.right[0] + dx("right"), row.slice(bands.right[0], bands.right[1] + 1));
    out[r] = cells.join("");
  }
  return out;
}

/**
 * Passing pose: the swing leg lifts one row and tucks one column
 * toward the body center; the planted leg holds the base stance.
 */
function passingLegs(grid: PixelGrid, build: BodyBuildId, swing: Side): string[] {
  const band = LEG_BANDS[build][swing];
  const inward = swing === "left" ? 1 : -1;
  const out = [...grid];
  for (let r = LEG_TOP; r <= FOOT_ROW; r++) {
    const source = r < FOOT_ROW ? (grid[r + 1] ?? BLANK) : BLANK;
    const cells = [...(out[r] ?? BLANK)];
    clearBand(cells, band);
    overlay(cells, band[0] + inward, source.slice(band[0], band[1] + 1));
    out[r] = cells.join("");
  }
  return out;
}

/** Whole body up one pixel (shadow stays): the stride's high point. */
function raisedBody(grid: PixelGrid): string[] {
  const out = [...grid];
  for (let r = 2; r < FOOT_ROW; r++) out[r] = grid[r + 1] ?? BLANK;
  out[FOOT_ROW] = BLANK;
  return out;
}

/** Whole body down one pixel: the bottom boot row compresses so the
 * feet stay planted above the shadow. */
function sunkBody(grid: PixelGrid): string[] {
  const out = [...grid];
  for (let r = FOOT_ROW; r > 3; r--) out[r] = grid[r - 1] ?? BLANK;
  out[3] = BLANK;
  return out;
}

/**
 * Arm counter-swing: the raised-side hand climbs one row in front of
 * the belt, the other drops one row onto the hip; the vacated hand
 * pixels close up with base cloth.
 */
function armsSwung(
  grid: PixelGrid,
  build: BodyBuildId,
  raisedSide: Side,
): string[] {
  const hands = BODY_FRAME.hands[build];
  const [top, bottom] = hands.rows;
  const out = [...grid];
  for (const side of ["left", "right"] as const) {
    const raised = side === raisedSide;
    for (const c of hands[side]) {
      const ch = grid[top]?.[c] ?? ".";
      setCell(out, raised ? top - 1 : bottom + 1, c, ch);
      setCell(out, raised ? bottom : top, c, "W");
    }
  }
  return out;
}

/** One stride half: contact, recoil (sunk), passing, reach (raised). */
function strideHalf(
  base: PixelGrid,
  build: BodyBuildId,
  lead: Side,
): PixelGrid[] {
  const trail = other(lead);
  return [
    armsSwung(
      stridedLegs(base, build, lead, CONTACT_STEPS, CONTACT_STEPS),
      build,
      trail,
    ),
    sunkBody(
      armsSwung(
        stridedLegs(base, build, lead, RECOIL_LEAD_STEPS, RECOIL_REAR_STEPS),
        build,
        trail,
      ),
    ),
    passingLegs(base, build, trail),
    // The swing leg leads from here on, so the arms swing with it: the
    // hand that will be trailing at the next contact is already coming
    // up. The half hands over mid-pose rather than at the frame break.
    raisedBody(
      armsSwung(
        stridedLegs(base, build, trail, REACH_LEAD_STEPS, REACH_REAR_STEPS),
        build,
        lead,
      ),
    ),
  ];
}

function walkFrames(base: PixelGrid, build: BodyBuildId): PixelGrid[] {
  return [...strideHalf(base, build, "right"), ...strideHalf(base, build, "left")];
}

/** Chest rise: the shoulder line climbs one row over the neck. */
function inhaled(grid: PixelGrid): string[] {
  const shoulder = BODY_FRAME.neck.bottom + 1;
  const out = [...grid];
  out[shoulder - 1] = grid[shoulder] ?? BLANK;
  out[shoulder] = grid[shoulder + 1] ?? BLANK;
  return out;
}

/** Full inhale: head and neck ride one pixel up on the risen chest. */
function headLifted(grid: PixelGrid): string[] {
  const out = [...grid];
  for (let r = 2; r < BODY_FRAME.neck.top; r++) out[r] = grid[r + 1] ?? BLANK;
  return out;
}

/** Neutral → rise → peak → settle; loops as a slow breath. */
function idleFrames(base: PixelGrid): PixelGrid[] {
  const rise = inhaled(base);
  return [base, rise, headLifted(rise), rise];
}

/**
 * Derive the full animation set from any base grid that honors the
 * 32×48 frame contract — the bare body or a layer-composed character.
 * The composition engine composes layers on the neutral pose and then
 * animates the result here, so faces, hair, and gear ride the body's
 * breathe/stride transforms without per-layer animation.
 */
export function bodyAnimFrames(
  base: PixelGrid,
  build: BodyBuildId,
): Readonly<Record<LoopState, readonly PixelGrid[]>> {
  return { idle: idleFrames(base), walk: walkFrames(base, build) };
}

function animSet(
  build: BodyBuildId,
  view: BodyViewId,
): Readonly<Record<LoopState, readonly PixelGrid[]>> {
  return bodyAnimFrames(BODY_GRIDS[build][view], build);
}

/**
 * Animation frame sets for every build and authored view. South/west
 * facings mirror these whole frames, exactly like the static grids.
 * Frame counts match BODY_TIMING in ../../animation.
 */
export const BODY_ANIM: Readonly<
  Record<
    BodyBuildId,
    Readonly<Record<BodyViewId, Readonly<Record<LoopState, readonly PixelGrid[]>>>>
  >
> = {
  lean: { front: animSet("lean", "front"), back: animSet("lean", "back") },
  heavy: { front: animSet("heavy", "front"), back: animSet("heavy", "back") },
};
