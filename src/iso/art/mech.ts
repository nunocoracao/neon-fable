/**
 * The Warden Chassis: the first thing in the Sprawl too big to stand on
 * one tile.
 *
 * Everything else that fights is a 32×48 figure on a single tile — a
 * composed person, or the drone's authored shell (./drone). A security
 * chassis is neither. It is authored whole here, in a **96×112 frame
 * anchored at (48, 104)**, and it is drawn over the *centre* of the 2×2
 * block its `footprint` claims (see ../../combat/footprint.ts), which is
 * why the anchor sits on the middle of a wide ground shadow rather than
 * between a pair of boots.
 *
 * ## Nothing downstream knows it is big
 *
 * The frame is the only thing that changes. `entityFrame` in ./entity
 * reports it, the provider bakes and anchors against it, and the combat
 * scene positions every sprite by its own anchor already — so depth
 * sorting, hit flashes, status markers, and camera focus need no cases
 * for a boss. A second multi-tile chassis is a second entry in
 * MECH_ART, and nothing else.
 *
 * ## The sets
 *
 * - **idle** — four frames of servo shift: the torso settles a pixel and
 *   sways, the legs never move. Frame count matches BODY_TIMING.idle.
 * - **walk** — eight frames of stomp-step: the whole chassis rises and
 *   drops on alternating legs, leaning into the travel, with the near
 *   foot lifting clear on the contact beats and the frame recovering
 *   off the landing before the other leg goes. Frame count matches
 *   BODY_TIMING.walk.
 * - **attack, variant 0 — piston smash** — the hydraulic arm goes up,
 *   hangs, and comes down through the deck. Four frames on the `baton`
 *   timing (raise, hang, strike, recover).
 * - **attack, variant 1 — shoulder volley** — the chassis plants, the
 *   shoulder battery rises and lights, the salvo leaves, and the frame
 *   rides the recoil. Five frames on the `rifle` timing.
 * - **charge** — the *held* wind-up: battery up, capacitors burning, the
 *   whole thing planted. Not a one-shot; it is what the chassis looks
 *   like for the entire turn it spends announcing where the volley is
 *   going. Four frames, on the idle cadence.
 * - **reactions** — authored, not borrowed. The shared transforms in
 *   ./layers/hit are cut to the 32×48 body frame; a chassis flinches by
 *   shoving its upper bands and dies by folding in four distinct stages
 *   (buckle, knee, topple, wreck), throwing charge the whole way down.
 *
 * Every frame is derived from two authored base grids (front and back)
 * by pure transforms, in the same spirit as ./drone and ./layers/bodyAnim:
 * a bigger set is never a second set of drawings. The anchor column and
 * the shadow band survive every transform, so no frame can walk the
 * chassis off the block it is standing on.
 *
 * ## Channels
 *
 * Fixed colors, not remap channels — a chassis has no appearance. Plate
 * in the brushed-chrome ramp (6/T/9) over charcoal recesses, hazard
 * chevrons in the corp signage ramp (Y/Z/n), the optic in danger red (p)
 * and the shoulder battery's charge in neon amber (m/n). The last two
 * are emissive, so the eye and the capacitors keep their bite at every
 * hour of the day.
 */
import { hash2 } from "../animation";
import type { AttackClassId } from "../attack";
import type { ReactionKind } from "../reaction";
import type { ArtDensity } from "./density";
import { PORTRAIT_FRAME } from "./layers/portrait";
import { mirrored, type PixelGrid } from "./pixel";

/** Authored multi-tile chassis sets; content names one of these. */
export const MECH_ART_IDS = ["warden-chassis"] as const;

export type MechArtId = (typeof MECH_ART_IDS)[number];

/** The views a chassis is authored in; the other two facings mirror. */
export const MECH_VIEW_IDS = ["front", "back"] as const;

export type MechViewId = (typeof MECH_VIEW_IDS)[number];

/**
 * The multi-tile layer frame. Read this before touching a grid below —
 * every band below is stated in these rows.
 *
 * - Anchor (48, 104): the centre of the ground shadow, which lands on
 *   the centre of the 2×2 block.
 * - Sensor cowl rows 6–17, shoulder deck 18–31, torso plate 32–57,
 *   hip cradle 58–69, legs 70–95, foot pads 96–99.
 * - Ground shadow: rows 100–107, and no transform may touch them.
 */
export const MECH_FRAME = {
  width: 96,
  height: 112,
  /** What the numbers in this frame are counted in (see ./density.ts). */
  density: 1 as ArtDensity,
  anchorX: 48,
  anchorY: 104,
  /** Last row the chassis itself may occupy; the shadow is below it. */
  groundRow: 99,
  shadow: { top: 100, bottom: 107, centerX: 48 },
} as const;

const WIDTH = MECH_FRAME.width;
const HEIGHT = MECH_FRAME.height;
const GROUND_ROW = MECH_FRAME.groundRow;
const SHADOW_TOP = MECH_FRAME.shadow.top;
const TRANSPARENT = ".";

/* --- A tiny mutable canvas, so the chassis can be laid out in bands
 * and then have its lamps, seams, and chevrons stamped on top. Nothing
 * here escapes the module: everything is frozen into PixelGrids at
 * load. --- */

type Canvas = string[][];

function blankCanvas(): Canvas {
  return Array.from({ length: HEIGHT }, () =>
    Array<string>(WIDTH).fill(TRANSPARENT),
  );
}

function toGrid(canvas: Canvas): PixelGrid {
  return canvas.map((row) => row.join(""));
}

function toCanvas(grid: PixelGrid): Canvas {
  return Array.from({ length: HEIGHT }, (_, y) => {
    const row = grid[y] ?? "";
    return Array.from({ length: WIDTH }, (_, x) => row[x] ?? TRANSPARENT);
  });
}

/** Stamp a run of characters; "." in the body leaves the canvas alone. */
function stamp(canvas: Canvas, y: number, x: number, body: string): void {
  const row = canvas[y];
  if (!row) return;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] ?? TRANSPARENT;
    if (ch === TRANSPARENT) continue;
    const at = x + i;
    if (at >= 0 && at < WIDTH) row[at] = ch;
  }
}

/**
 * How a plated slab is shaded: a three-step ramp lit toward the
 * top-left light source, like every other material in the game. The
 * bulk of the chassis is authored in the *slate* ramp rather than the
 * chrome one — Auric's interior plate is flood-grey, and a chassis
 * painted in speculars all the way through reads as a white slab and
 * leaves the optic and the capacitors nothing to burn against.
 */
interface PlateInk {
  /** Columns of highlight along the lit (left) edge, and its colour. */
  readonly lit: number;
  readonly light: string;
  /** Columns of shade along the shadowed (right) edge, and its colour. */
  readonly shade: number;
  readonly dark: string;
  /** The plate's own colour between them. */
  readonly base: string;
  /** Outline; every slab carries one so the silhouette reads. */
  readonly ink: string;
}

/** Interdiction plate: the slate ramp, which is most of the chassis. */
const PLATE: PlateInk = {
  lit: 3,
  light: "7",
  shade: 4,
  dark: "3",
  base: "5",
  ink: "0",
};

/** Recesses, housings, and vents: charcoal, a step down from the plate. */
const DARK: PlateInk = {
  lit: 1,
  light: "4",
  shade: 2,
  dark: "1",
  base: "2",
  ink: "0",
};

/** Brushed chrome: the shoulder deck and the sensor cowl only. */
const CHROME: PlateInk = {
  lit: 3,
  light: "9",
  shade: 4,
  dark: "6",
  base: "T",
  ink: "0",
};

function plateRow(width: number, ink: PlateInk, capped = true): string {
  const inner = Math.max(0, width - (capped ? 2 : 0));
  const lit = Math.min(ink.lit, Math.max(0, inner - ink.shade));
  const shade = Math.min(ink.shade, Math.max(0, inner - lit));
  const body =
    ink.light.repeat(lit) +
    ink.base.repeat(inner - lit - shade) +
    ink.dark.repeat(shade);
  return capped ? ink.ink + body + ink.ink : body;
}

/**
 * A plated box: a slab of `width` from `left`, capped top and bottom by
 * an ink line so it reads as a solid rather than a stripe.
 */
function box(
  canvas: Canvas,
  top: number,
  bottom: number,
  left: number,
  width: number,
  ink: PlateInk = PLATE,
): void {
  for (let y = top; y <= bottom; y++) {
    const edge = y === top || y === bottom;
    stamp(canvas, y, left, edge ? ink.ink.repeat(width) : plateRow(width, ink));
  }
}

/** A box whose width tapers linearly from `topWidth` to `bottomWidth`. */
function taper(
  canvas: Canvas,
  top: number,
  bottom: number,
  centerX: number,
  topWidth: number,
  bottomWidth: number,
  ink: PlateInk = PLATE,
): void {
  const span = Math.max(1, bottom - top);
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / span;
    const width = Math.round(topWidth + (bottomWidth - topWidth) * t);
    const left = centerX - Math.floor(width / 2);
    const edge = y === top || y === bottom;
    stamp(
      canvas,
      y,
      left,
      edge ? ink.ink.repeat(width) : plateRow(width, ink),
    );
  }
}

/** An ellipse of translucent ground shadow, centred on the anchor. */
function shadowBand(canvas: Canvas): void {
  const { top, bottom, centerX } = MECH_FRAME.shadow;
  const rows = bottom - top;
  const midpoint = (top + bottom) / 2;
  const halfRows = rows / 2;
  for (let y = top; y <= bottom; y++) {
    const t = (y - midpoint) / halfRows;
    const half = Math.round(44 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (half <= 0) continue;
    stamp(canvas, y, centerX - half, "z".repeat(half * 2));
  }
}

/* --- The chassis itself. Authored once per view; the two views differ
 * in what the head shows (an optic or a cooling stack) and which way
 * the hazard chevrons run. --- */

/** Where the shoulder battery's ports sit, in the front (east) view. */
const BATTERY_MUZZLE = { x: 84, y: 24 } as const;
/** Where the piston fist lands, in the front (east) view. */
const PISTON_MUZZLE = { x: 76, y: 58 } as const;

/** A run of hazard chevrons stepping along one edge. */
function chevrons(canvas: Canvas, top: number, left: number, step: number): void {
  for (let i = 0; i < 5; i++) {
    stamp(canvas, top + i * 2, left + i * step, "YZnZY");
    stamp(canvas, top + i * 2 + 1, left + i * step, "YZnZY");
  }
}

function chassisCanvas(view: MechViewId): Canvas {
  const canvas = blankCanvas();
  shadowBand(canvas);

  // Legs: two heavy cradles, the near one (right, toward the viewer)
  // planted forward. Drawn first so the hips overlap them.
  box(canvas, 70, 95, 26, 18);
  box(canvas, 70, 95, 54, 18);
  // Knee actuators and shin vents, dark against the plate.
  for (const left of [29, 57]) {
    box(canvas, 76, 84, left, 12, DARK);
    for (const y of [88, 91]) stamp(canvas, y, left + 1, "1".repeat(10));
  }
  // Foot pads, wider than the legs they carry.
  box(canvas, 94, 99, 20, 28);
  box(canvas, 94, 99, 50, 28);

  // Hip cradle, bridging the legs.
  taper(canvas, 58, 69, 48, 46, 54);

  // Torso: the interdiction plate, widest at the shoulders.
  taper(canvas, 32, 57, 48, 56, 44);
  // Chest recess with the core lamp burning in it.
  box(canvas, 38, 52, 34, 26, DARK);

  // Shoulder deck: the widest band on the chassis, and one of the two
  // chrome pieces — a bright bar across the top reads as a machine
  // built in sections rather than milled from one block.
  box(canvas, 18, 31, 8, 80, CHROME);

  // Sensor cowl, set forward of the deck.
  taper(canvas, 6, 17, 50, 20, 32, CHROME);

  // The counterweight on the far shoulder, and the two things on the
  // near one: the battery over the piston arm's mount.
  box(canvas, 20, 30, 10, 20, DARK);
  box(canvas, 18, 29, 62, 26);
  // Battery ports: three emitters looking down the chassis's own line.
  for (const y of [22, 24, 26]) stamp(canvas, y, 85, "0mm0");

  // The piston arm, folded down the near side: shoulder housing, upper
  // arm, elbow, ram sleeve, hammer head. Five pieces of decreasing
  // width down to the mass at the end, so a raised arm reads as an arm
  // rather than as a shelf sliding up the torso. Everything stays above
  // row 70, which is where the legs begin — the two never share a row,
  // so a stomp and a swing can never tear each other.
  box(canvas, 30, 42, 60, 24);
  box(canvas, 34, 40, 64, 14, DARK);
  box(canvas, 42, 54, 68, 16);
  box(canvas, 52, 58, 66, 20, DARK);
  box(canvas, 56, 64, 70, 16);
  box(canvas, 60, 69, 64, 28);
  box(canvas, 63, 67, 68, 18, DARK);

  if (view === "front") {
    // The optic: a single crimson band under the cowl's brow.
    stamp(canvas, 11, 40, "0pppppppppppp0");
    stamp(canvas, 12, 40, "0pppppppppppp0");
    stamp(canvas, 13, 41, "0pppppppppp0");
    // Core lamp in the chest recess.
    for (const y of [43, 44, 45, 46]) stamp(canvas, y, 44, "mmmm");
    // Hazard chevrons along the lit edge of the shoulder deck.
    chevrons(canvas, 20, 12, 2);
  } else {
    // From behind: no optic, a cooling stack and a lit service panel.
    for (const y of [9, 11, 13, 15]) stamp(canvas, y, 42, "1111111111");
    box(canvas, 38, 52, 34, 26, DARK);
    for (const y of [42, 45, 48]) stamp(canvas, y, 38, "1".repeat(18));
    stamp(canvas, 44, 58, "mm");
    chevrons(canvas, 20, 20, -2);
  }

  // Plate seams down the torso and the hips, in both views: a slab this
  // size needs something running across it or it reads as a blank door.
  for (const y of [35, 55]) stamp(canvas, y, 22, "1".repeat(52));
  for (const y of [62, 66]) stamp(canvas, y, 26, "1".repeat(44));

  return canvas;
}

const BASE: Readonly<Record<MechViewId, PixelGrid>> = {
  front: toGrid(chassisCanvas("front")),
  back: toGrid(chassisCanvas("back")),
};

/* --- Pure frame transforms. Every one leaves the shadow rows and the
 * (48, 104) anchor alone, so no frame can drift the chassis off its
 * block. --- */

/** A rectangle of the frame a transform is allowed to move. */
interface Region {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

const FULL_WIDTH = { left: 0, right: WIDTH - 1 } as const;

/** Everything above the hips; what a lean and a flinch throw. */
const UPPER: Region = { top: 0, bottom: 57, ...FULL_WIDTH };
/** The whole chassis, shadow excluded; what a stomp lifts. */
const CHASSIS: Region = { top: 0, bottom: GROUND_ROW, ...FULL_WIDTH };
/** The piston arm off the near shoulder, clear of the torso plate. */
const ARM: Region = { top: 28, bottom: 69, left: 58, right: WIDTH - 1 };
/** The shoulder battery, clear of the deck it is bolted to. */
const BATTERY: Region = { top: 14, bottom: 31, left: 60, right: WIDTH - 1 };
/** The two legs, by side; nothing above the hips is in either. */
const LEGS: Readonly<Record<"far" | "near", Region>> = {
  far: { top: 70, bottom: GROUND_ROW, left: 16, right: 47 },
  near: { top: 70, bottom: GROUND_ROW, left: 48, right: 79 },
};

/**
 * A region of the frame moved by (dx, dy): the strip is cleared and the
 * pixels re-laid at the offset, so a moved band leaves a real gap behind
 * it instead of a smear. Anything outside the rectangle holds, which is
 * what lets the piston arm swing without taking the torso with it.
 */
function regionMoved(
  grid: PixelGrid,
  region: Region,
  dx: number,
  dy: number,
): PixelGrid {
  if (dx === 0 && dy === 0) return grid;
  const out = toCanvas(grid);
  for (let y = region.top; y <= region.bottom; y++) {
    const row = out[y];
    if (!row) continue;
    for (let x = region.left; x <= region.right; x++) row[x] = TRANSPARENT;
  }
  for (let y = region.top; y <= region.bottom; y++) {
    const source = grid[y - dy];
    if (source === undefined || y - dy < region.top || y - dy > region.bottom) {
      continue;
    }
    const row = out[y];
    if (!row) continue;
    for (let x = region.left; x <= region.right; x++) {
      const ch = source[x] ?? TRANSPARENT;
      if (ch === TRANSPARENT) continue;
      const nx = x + dx;
      if (nx >= region.left && nx <= region.right) row[nx] = ch;
    }
  }
  return toGrid(out);
}

/** The whole chassis moved, shadow excluded: a stomp, or a settle. */
function chassisMoved(grid: PixelGrid, dx: number, dy: number): PixelGrid {
  return regionMoved(grid, CHASSIS, dx, dy);
}

/** One leg lifted clear of the deck. */
function legLifted(grid: PixelGrid, side: "far" | "near", lift: number): PixelGrid {
  return regionMoved(grid, LEGS[side], 0, -lift);
}

/** An overlay grid composited over the chassis (lamps, charge, sparks). */
function overlaid(grid: PixelGrid, overlay: PixelGrid | null): PixelGrid {
  if (!overlay) return grid;
  const out = toCanvas(grid);
  overlay.forEach((row, y) => stamp(out, y, 0, row));
  return toGrid(out);
}

function overlay(rows: Readonly<Record<number, [number, string]>>): PixelGrid {
  const canvas = blankCanvas();
  for (const [row, [left, body]] of Object.entries(rows)) {
    stamp(canvas, Number(row), left, body);
  }
  return toGrid(canvas);
}

/** Capacitors gathering at the shoulder battery, before the salvo. */
const CHARGE_LOW = overlay({
  22: [85, "0nn0"],
  24: [85, "0nn0"],
  26: [85, "0nn0"],
  23: [89, "m"],
  25: [89, "m"],
});

/** Capacitors full: the whole battery lit, spilling off its ports. */
const CHARGE_HIGH = overlay({
  21: [84, "mmmmm"],
  22: [84, "0nnn0m"],
  23: [84, "mnnnnm"],
  24: [84, "0nnn0m"],
  25: [84, "mnnnnm"],
  26: [84, "0nnn0m"],
  27: [84, "mmmmm"],
});

/** The salvo leaving: three rounds off the deck, already downrange. */
const DISCHARGE = overlay({
  21: [82, "mmnnnnnm"],
  23: [82, "mnnnnnnnnm"],
  25: [82, "mmnnnnnm"],
  22: [92, "nn"],
  24: [92, "nn"],
});

/** The piston fist coming through the deck. */
const IMPACT_SPARKS = overlay({
  66: [58, "n..m..n"],
  68: [54, "m....n....m"],
  70: [56, "n..m..m..n"],
});

/* --- The sets. --- */

/** One derived frame: how the chassis is displaced, and what is lit. */
interface MechFrameSpec {
  readonly dx?: number;
  readonly dy?: number;
  /** Upper-band lean (rows 0–57), on top of the whole-body move. */
  readonly lean?: number;
  /** Piston-arm band (rows 32–64) displacement. */
  readonly armDy?: number;
  /** Battery band (rows 18–31) displacement. */
  readonly batteryDy?: number;
  readonly nearLift?: number;
  readonly farLift?: number;
  readonly glow?: PixelGrid;
}

function frameFrom(view: MechViewId, spec: MechFrameSpec): PixelGrid {
  let grid = BASE[view];
  if (spec.armDy) grid = regionMoved(grid, ARM, 0, spec.armDy);
  if (spec.batteryDy) grid = regionMoved(grid, BATTERY, 0, spec.batteryDy);
  if (spec.lean) grid = regionMoved(grid, UPPER, spec.lean, 0);
  if (spec.nearLift) grid = legLifted(grid, "near", spec.nearLift);
  if (spec.farLift) grid = legLifted(grid, "far", spec.farLift);
  grid = chassisMoved(grid, spec.dx ?? 0, spec.dy ?? 0);
  return overlaid(grid, spec.glow ?? null);
}

/** Servo shift: the frame settles and sways; the legs never move. */
const IDLE_SPEC: readonly MechFrameSpec[] = [
  {},
  { lean: 1, batteryDy: -1 },
  { dy: -1, lean: 1 },
  { batteryDy: -1 },
];

/**
 * Stomp-step, four beats a leg: the foot comes up, swings through,
 * lands hard enough to drop the chassis a pixel, then the frame
 * recovers onto it while the other leg takes its turn. Leaning into
 * the travel throughout.
 */
const WALK_SPEC: readonly MechFrameSpec[] = [
  { dy: -1, lean: 1, nearLift: 3 },
  { dy: 0, lean: 2, nearLift: 1 },
  { dy: 1, lean: 2 },
  { dy: 0, lean: 1 },
  { dy: -1, lean: 1, farLift: 3 },
  { dy: 0, lean: 2, farLift: 1 },
  { dy: 1, lean: 2 },
  { dy: 0, lean: 1 },
];

/** Piston smash, on the `baton` timing: raise, hang, strike, recover. */
const PISTON_SPEC: readonly MechFrameSpec[] = [
  { armDy: -8, lean: -2 },
  { armDy: -11, lean: -3, dy: -1 },
  { armDy: 6, lean: 4, dy: 1, glow: IMPACT_SPARKS },
  { armDy: 2, lean: 1 },
];

/** Shoulder volley, on the `rifle` timing: plant, raise, burn, fire, ride. */
const CANNON_SPEC: readonly MechFrameSpec[] = [
  { dy: 1 },
  { batteryDy: -3, dy: 1, glow: CHARGE_LOW },
  { batteryDy: -4, dy: 1, glow: CHARGE_HIGH },
  { batteryDy: -4, lean: -3, dy: 1, glow: DISCHARGE },
  { batteryDy: -1, lean: -1 },
];

/**
 * The held wind-up: planted, battery up, capacitors burning. This is
 * what the chassis looks like for the whole turn it spends telling the
 * room where the salvo is going — a stance, not a one-shot.
 */
const CHARGE_SPEC: readonly MechFrameSpec[] = [
  { dy: 1, batteryDy: -4, glow: CHARGE_LOW },
  { dy: 1, batteryDy: -4, glow: CHARGE_HIGH },
  { dy: 1, batteryDy: -5, glow: CHARGE_HIGH },
  { dy: 1, batteryDy: -4, glow: CHARGE_LOW },
];

/* --- Reactions. Authored here rather than borrowed from ./layers/hit,
 * whose transforms are cut to the 32×48 body frame. --- */

/** How far the upper bands are thrown, per frame of a survived blow. */
const HIT_SPEC: Readonly<Record<"flinch" | "shudder", readonly number[]>> = {
  // A solid blow rocks the whole frame back and lets it come most of
  // the way home.
  flinch: [4, 2],
  // Plating took it: the chassis gives a pixel and shrugs back into it.
  shudder: [2, -1],
};

/** One stage of the collapse: how far folded, how far over, how sparky. */
interface FallStage {
  /** 0 = standing, 1 = wreckage on the deck. */
  readonly fall: number;
  /** Pixels the top of the chassis leans over at this stage. */
  readonly lean: number;
  /** Sparks thrown as it goes. */
  readonly sparks: number;
}

/**
 * Four stages, and each is a distinct thing happening: the frame
 * buckles on its servos, a knee gives and drops it, the whole mass
 * topples over the failed leg, and what is left settles into a slab of
 * wreckage that stays on the deck for the rest of the fight.
 */
const FALL_STAGES: readonly FallStage[] = [
  { fall: 0.18, lean: 2, sparks: 6 },
  { fall: 0.48, lean: 6, sparks: 14 },
  { fall: 0.78, lean: 13, sparks: 20 },
  { fall: 1, lean: 18, sparks: 8 },
];

/** How much of its standing height the wreck keeps. */
const WRECK_HEIGHT = 0.22;

/**
 * The chassis folded onto its own shadow. Rows are re-laid at a
 * fraction of their standing height and leaned as they go, painted
 * bottom-up so the cowl and the deck come to rest on top of the legs.
 * The shadow band is copied through untouched.
 */
function folded(grid: PixelGrid, fall: number, lean: number): PixelGrid {
  const out = blankCanvas();
  for (let y = SHADOW_TOP; y < HEIGHT; y++) {
    const row = grid[y];
    if (row) stamp(out, y, 0, row);
  }
  const keep = 1 - fall * (1 - WRECK_HEIGHT);
  for (let y = GROUND_ROW; y >= 0; y--) {
    const source = grid[y];
    if (!source) continue;
    const height = GROUND_ROW - y;
    const ny = Math.round(GROUND_ROW - height * keep);
    if (ny < 0 || ny > GROUND_ROW) continue;
    const dx = Math.round((lean * height) / GROUND_ROW);
    const row = out[ny];
    if (!row) continue;
    for (let x = 0; x < WIDTH; x++) {
      const ch = source[x] ?? TRANSPARENT;
      if (ch === TRANSPARENT) continue;
      const nx = x + dx;
      if (nx >= 0 && nx < WIDTH) row[nx] = ch;
    }
  }
  return toGrid(out);
}

/** Columns a spark may burn in, and how far above the wreck it may fly. */
const SPARK_REGION = { left: 8, right: 87, lift: 4 } as const;

/** The topmost painted row of a grid, or the ground line when it is empty. */
function topRow(grid: PixelGrid): number {
  for (let y = 0; y <= GROUND_ROW; y++) {
    if (/[^.z]/.test(grid[y] ?? "")) return y;
  }
  return GROUND_ROW;
}

/**
 * Deterministic sparks over a falling chassis: seeded from the frame
 * index alone, so the same death plays the same way every time. They
 * burn over the wreckage as it settles — the band follows the fold, so
 * a stage that is nearly flat throws its charge along the deck rather
 * than leaving embers hanging where the chassis used to be.
 */
function sparked(grid: PixelGrid, count: number, seed: number): PixelGrid {
  if (count <= 0) return grid;
  const out = toCanvas(grid);
  const top = Math.max(0, topRow(grid) - SPARK_REGION.lift);
  const rows = GROUND_ROW - top + 1;
  const cols = SPARK_REGION.right - SPARK_REGION.left + 1;
  for (let i = 0; i < count; i++) {
    const h = hash2(seed * 131 + i, seed + i * 17);
    const y = top + (h % rows);
    const x = SPARK_REGION.left + (Math.floor(h / rows) % cols);
    const row = out[y];
    if (row) row[x] = i % 3 === 0 ? "n" : "m";
  }
  return toGrid(out);
}

/**
 * One reaction frame. `awayX` is the screen-x direction away from the
 * blow, applied *after* the facing mirror — a chassis shoved right is
 * shoved right on every facing, exactly as a body is.
 */
function reactionGrid(
  resting: PixelGrid,
  kind: ReactionKind,
  frame: number,
  awayX: -1 | 1,
): PixelGrid {
  if (kind === "flinch" || kind === "shudder") {
    const dx = (HIT_SPEC[kind][frame] ?? 0) * awayX;
    // Head and deck take it, the torso follows at half, and the legs
    // stay planted: a blow staggers a chassis without moving its block.
    return regionMoved(
      regionMoved(resting, { top: 0, bottom: 31, ...FULL_WIDTH }, dx, 0),
      { top: 32, bottom: 57, ...FULL_WIDTH },
      Math.round(dx / 2),
      0,
    );
  }
  const stage = FALL_STAGES[Math.min(frame, FALL_STAGES.length - 1)];
  if (!stage) return resting;
  return sparked(
    folded(resting, stage.fall, stage.lean * awayX),
    // A machine spits charge as it goes; a "collapse" death on a
    // chassis is the same fold with the arcing turned down.
    kind === "sparkout" ? stage.sparks : Math.round(stage.sparks / 3),
    frame + 1,
  );
}

/* --- The portrait: the cowl and the optic, close enough to see that
 * nothing is looking back. --- */

const PW = PORTRAIT_FRAME.width;
const PBLANK = TRANSPARENT.repeat(PW);
const prow = (left: number, body: string): string =>
  TRANSPARENT.repeat(left) + body + TRANSPARENT.repeat(PW - left - body.length);
const pplate = (left: number, width: number): string =>
  prow(left, plateRow(width, PLATE));

const MECH_PORTRAIT: PixelGrid = [
  PBLANK,
  PBLANK,
  prow(13, "0".repeat(22)),
  pplate(11, 26),
  pplate(9, 30),
  pplate(8, 32),
  pplate(7, 34),
  pplate(6, 36),
  pplate(6, 36),
  prow(6, "0999" + "2".repeat(28) + "660"),
  prow(6, "0999" + "2".repeat(28) + "660"),
  pplate(6, 36),
  pplate(5, 38),
  prow(5, "099" + "0".repeat(32) + "660"),
  prow(5, "099" + "0" + "p".repeat(30) + "0" + "660"),
  prow(5, "099" + "0" + "p".repeat(30) + "0" + "660"),
  prow(5, "099" + "0" + "9pppppp".repeat(1) + "p".repeat(23) + "0" + "660"),
  prow(5, "099" + "0" + "p".repeat(30) + "0" + "660"),
  prow(5, "099" + "0".repeat(32) + "660"),
  pplate(5, 38),
  pplate(5, 38),
  prow(5, "099" + "2".repeat(32) + "660"),
  pplate(5, 38),
  pplate(6, 36),
  prow(6, "0" + "Zn".repeat(17) + "0"),
  pplate(6, 36),
  pplate(4, 40),
  pplate(2, 44),
  prow(2, "099" + "2".repeat(38) + "660"),
  pplate(2, 44),
  pplate(2, 44),
  prow(1, "0" + "9".repeat(3) + "T".repeat(38) + "6".repeat(3) + "0"),
  prow(1, "0" + "9".repeat(3) + "T".repeat(38) + "6".repeat(3) + "0"),
  prow(1, "0" + "2".repeat(44) + "0"),
  prow(0, "0" + "9".repeat(4) + "T".repeat(38) + "6".repeat(4) + "0"),
  prow(0, "0" + "9".repeat(4) + "T".repeat(38) + "6".repeat(4) + "0"),
  prow(0, "0" + "2".repeat(46) + "0"),
  prow(0, "0" + "9".repeat(4) + "T".repeat(38) + "6".repeat(4) + "0"),
  prow(0, "0" + "9".repeat(4) + "T".repeat(38) + "6".repeat(4) + "0"),
  prow(0, "0" + "9".repeat(4) + "T".repeat(38) + "6".repeat(4) + "0"),
  prow(0, "0".repeat(48)),
  ...Array<string>(7).fill(PBLANK),
];

/* --- The registry. --- */

/** The frame sets a chassis is animated from; reactions are derived. */
export const MECH_SET_IDS = ["idle", "walk", "charge"] as const;

export type MechSetId = (typeof MECH_SET_IDS)[number];

/** One authored multi-tile chassis. */
export interface MechArt {
  /**
   * The attack animation each variant swings, in variant order. Index 0
   * is the chassis's default swing (the class `entityAttackClass`
   * reports); content picks another by `Ability.attackVariant`. The
   * class pins each set's frame count and its effect style — a piston
   * comes through as an arc smear, a shoulder battery as tracers.
   */
  readonly attackClasses: readonly AttackClassId[];
  /** Looping and held sets per authored view. */
  readonly frames: Readonly<
    Record<MechViewId, Readonly<Record<MechSetId, readonly PixelGrid[]>>>
  >;
  /** Attack sets per view, indexed by variant. */
  readonly attacks: Readonly<Record<MechViewId, readonly (readonly PixelGrid[])[]>>;
  /** Resting grid per view; the reaction transforms fold this one. */
  readonly neutral: Readonly<Record<MechViewId, PixelGrid>>;
  /**
   * Where each variant's blow leaves, in 1x art pixels of the authored
   * (unflipped) frame: the battery ports, the piston fist. Mirrors with
   * the figure on the south and west facings, like every muzzle does.
   */
  readonly muzzles: readonly { readonly x: number; readonly y: number }[];
  /** 48×48 portrait grid; the initiative rail's face for a chassis. */
  readonly portrait: PixelGrid;
}

function setsFor(view: MechViewId): Record<MechSetId, readonly PixelGrid[]> {
  return {
    idle: IDLE_SPEC.map((spec) => frameFrom(view, spec)),
    walk: WALK_SPEC.map((spec) => frameFrom(view, spec)),
    charge: CHARGE_SPEC.map((spec) => frameFrom(view, spec)),
  };
}

function wardenChassis(): MechArt {
  const attacksFor = (view: MechViewId): readonly (readonly PixelGrid[])[] => [
    PISTON_SPEC.map((spec) => frameFrom(view, spec)),
    CANNON_SPEC.map((spec) => frameFrom(view, spec)),
  ];
  return {
    // The piston swings like an overhead baton; the shoulder battery
    // fires like a shouldered long gun. Both are existing classes, so
    // their timings, their lunge weights, and their effect styles all
    // come for free.
    attackClasses: ["baton", "rifle"],
    frames: { front: setsFor("front"), back: setsFor("back") },
    attacks: { front: attacksFor("front"), back: attacksFor("back") },
    neutral: { front: BASE.front, back: BASE.back },
    muzzles: [PISTON_MUZZLE, BATTERY_MUZZLE],
    portrait: MECH_PORTRAIT,
  };
}

/** Every authored multi-tile chassis, by id. */
export const MECH_ART: Readonly<Record<MechArtId, MechArt>> = {
  "warden-chassis": wardenChassis(),
};

/** Which authored view a facing draws, and whether it mirrors. */
export function mechViewForFacing(facing: "n" | "e" | "s" | "w"): {
  view: MechViewId;
  flip: boolean;
} {
  if (facing === "e") return { view: "front", flip: false };
  if (facing === "s") return { view: "front", flip: true };
  if (facing === "n") return { view: "back", flip: false };
  return { view: "back", flip: true };
}

/** The variant index clamped into the sets this chassis actually has. */
export function mechAttackVariant(id: MechArtId, variant: number): number {
  const count = MECH_ART[id].attackClasses.length;
  return Math.min(Math.max(0, Math.trunc(variant)), count - 1);
}

/** The attack class one variant swings. */
export function mechAttackClass(id: MechArtId, variant = 0): AttackClassId {
  const art = MECH_ART[id];
  return art.attackClasses[mechAttackVariant(id, variant)] ?? "unarmed";
}

/** How many frames a looping or held set has. */
export function mechFrameCount(id: MechArtId, set: MechSetId): number {
  return MECH_ART[id].frames.front[set].length;
}

/**
 * One frame of a chassis: the authored set for the facing's view,
 * mirrored for the south and west facings, with reactions folded from
 * the resting grid after the mirror.
 */
export function mechGrid(
  id: MechArtId,
  facing: "n" | "e" | "s" | "w",
  state: MechSetId | "attack" | "react",
  frame: number,
  options: {
    readonly attackVariant?: number;
    readonly reaction?: { kind: ReactionKind; awayX: -1 | 1 };
  } = {},
): PixelGrid {
  const art = MECH_ART[id];
  const { view, flip } = mechViewForFacing(facing);
  if (state === "react") {
    const reaction = options.reaction;
    if (!reaction) throw new Error("a react frame needs a reaction variant");
    const resting = art.neutral[view];
    return reactionGrid(
      flip ? mirrored(resting) : resting,
      reaction.kind,
      frame,
      reaction.awayX,
    );
  }
  const frames =
    state === "attack"
      ? art.attacks[view][mechAttackVariant(id, options.attackVariant ?? 0)] ?? []
      : art.frames[view][state];
  const grid = frames[frame];
  if (!grid) {
    throw new Error(`no mech ${state} frame ${frame} (have ${frames.length})`);
  }
  return flip ? mirrored(grid) : grid;
}

/** Where a variant's blow leaves this chassis, mirrored with the figure. */
export function mechMuzzlePoint(
  id: MechArtId,
  facing: "n" | "e" | "s" | "w",
  variant = 0,
): { x: number; y: number } {
  const art = MECH_ART[id];
  const point = art.muzzles[mechAttackVariant(id, variant)] ?? {
    x: MECH_FRAME.anchorX,
    y: MECH_FRAME.anchorY - 40,
  };
  const { flip } = mechViewForFacing(facing);
  return { x: flip ? WIDTH - 1 - point.x : point.x, y: point.y };
}

