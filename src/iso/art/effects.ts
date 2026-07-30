/**
 * Combat effect art: the muzzle flash, the tracer streak, the blade's
 * arc smear, and the sparks or wall dust a blow ends in. Authored as
 * palette-indexed grids like everything else and baked through the
 * sprite provider — there is no particle system here, only frames the
 * pure math in ../impact.ts positions and picks between.
 *
 * ## Anchors
 *
 * Every effect is anchored on the point it happens at: the muzzle for a
 * flash, the round itself for a tracer, the struck body (or the wall
 * behind it) for an impact. So all of these anchor at their own center
 * rather than on a ground contact — nothing here stands on a tile.
 *
 * ## Directions
 *
 * The tracer carries its slope in its id. Three slopes are authored —
 * flat, the iso grid's own 2:1 diagonal, and vertical — and the other
 * five directions are the mirrors and vertical flips of those, so a
 * shot always travels along the line it is drawn on. The swipe is
 * authored swinging to the right and mirrored for the other hand.
 *
 * ## Channels
 *
 * Fire is its own light, never a material: flashes, tracers, and sparks
 * burn in the neon amber pair (m/n) with white-ink (9) hot cores, the
 * same channels the attack sets' muzzle pixels use. A blade's smear is
 * chrome (6/T/9) — it is a lit edge, not a fire — and a miss throws
 * concrete: steel and chrome neutrals with the concrete highlight.
 */
import { EFFECT_SPRITE_IDS, EFFECT_TIMING, effectKind, type EffectSpriteId } from "../impact";
import { mirrored, type PixelGrid } from "./pixel";

/** One effect's frames plus the point they are anchored on. */
export interface EffectArt {
  readonly frames: readonly PixelGrid[];
  /** Anchor in 1x art pixels: the pixel that lands on the effect point. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Per-frame hold, from EFFECT_TIMING; 0 for single-frame effects. */
  readonly frameMs: number;
}

/* --- Muzzle flash: a four-point star of fire off the barrel, gone in
 * two frames. Hot white core, amber spokes cooling outward. --- */

const muzzleFlash: readonly PixelGrid[] = [
  [
    "....m....",
    "..m.n.m..",
    "...nnn...",
    "..nn9nn..",
    "mnn999nnm",
    "..nn9nn..",
    "...nnn...",
    "..m.n.m..",
    "....m....",
  ],
  [
    ".........",
    "....m....",
    "..m.n.m..",
    "...nnn...",
    ".m.n9n.m.",
    "...nnn...",
    "..m.n.m..",
    "....m....",
    ".........",
  ],
];

/* --- Spark burst: what a round or a blade throws off a body it went
 * through. A tight hot core, a ring flung out of it, then embers. --- */

const sparkBurst: readonly PixelGrid[] = [
  [
    "...........",
    "...........",
    "....m.m....",
    "...mnnnm...",
    "....n9n....",
    "...mn9nm...",
    "....n9n....",
    "...mnnnm...",
    "....m.m....",
    "...........",
    "...........",
  ],
  [
    "...........",
    "....m.m....",
    "..m..n..m..",
    ".m.......m.",
    "..n.....n..",
    "m....9....m",
    "..n.....n..",
    ".m.......m.",
    "..m..n..m..",
    "....m.m....",
    "...........",
  ],
  [
    "...........",
    "...........",
    "..o.....o..",
    "...........",
    ".m...m...m.",
    "...........",
    ".m...m...m.",
    "...........",
    "..o.....o..",
    "...........",
    "...........",
  ],
];

/* --- Wall chip: a miss. The round (or the swing) carries a tile past
 * whatever it was aimed at and takes a bite out of the arena instead:
 * concrete spall, then the dust off it drifting. --- */

const wallChip: readonly PixelGrid[] = [
  [
    "...........",
    "...........",
    "....9.9....",
    "...97879...",
    "..7.898.7..",
    "...97879...",
    "....9.9....",
    "...........",
    "...........",
  ],
  [
    "...........",
    "....6.6....",
    "..6..7..6..",
    ".6...8...6.",
    "..7..8..7..",
    "...6.7.6...",
    "....6.6....",
    "..S.....S..",
    "...........",
  ],
  [
    "...........",
    "...........",
    "...6...6...",
    "..6.....6..",
    "...........",
    "..6.....6..",
    "...6...6...",
    "...........",
    "...........",
  ],
];

/* --- Impact flash: a bare fist landing. No fire and no fragments —
 * just the compact white shock of the blow and the ring off it. --- */

const impactFlash: readonly PixelGrid[] = [
  [
    ".........",
    "....9....",
    "..9.9.9..",
    "...999...",
    ".9.999.9.",
    "...999...",
    "..9.9.9..",
    "....9....",
    ".........",
  ],
  [
    ".........",
    "...8.8...",
    "..8...8..",
    ".........",
    ".8..8..8.",
    ".........",
    "..8...8..",
    "...8.8...",
    ".........",
  ],
];

/* --- Swipe smear: the arc a blade, a baton, or the lash leaves as it
 * comes through. Generated rather than hand-plotted, so the curve is
 * a real arc at any radius and the two frames stay concentric: the
 * cut, then the thinner follow-through trailing behind it. --- */

/** Odd, so the arc has a true center pixel to swing around. */
const SWIPE_SIZE = 17;
const SWIPE_CENTER = (SWIPE_SIZE - 1) / 2;
/** The inner edge of a smear is its dim side; the outer edge is lit. */
const SWIPE_INNER = "6";

interface ArcSpec {
  readonly radius: number;
  readonly thickness: number;
  /** Degrees, counter-clockwise from screen-right; the swing runs from → to. */
  readonly from: number;
  readonly to: number;
  /** Colors along the stroke, trailing end first. */
  readonly ramp: readonly string[];
}

/** A frame-sized grid holding one arc, swung rightward from the center. */
function arcGrid(spec: ArcSpec): string[] {
  const cells = Array.from({ length: SWIPE_SIZE }, () =>
    Array<string>(SWIPE_SIZE).fill("."),
  );
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = ((spec.from + (spec.to - spec.from) * t) * Math.PI) / 180;
    const step = Math.min(spec.ramp.length - 1, Math.floor(t * spec.ramp.length));
    const lit = spec.ramp[step] ?? SWIPE_INNER;
    for (let k = 0; k < spec.thickness; k++) {
      const r = spec.radius - k;
      const x = Math.round(SWIPE_CENTER + Math.cos(angle) * r);
      const y = Math.round(SWIPE_CENTER - Math.sin(angle) * r);
      const row = cells[y];
      if (!row || x < 0 || x >= SWIPE_SIZE) continue;
      row[x] = k === 0 ? lit : SWIPE_INNER;
    }
  }
  return cells.map((row) => row.join(""));
}

const swipeEast: readonly PixelGrid[] = [
  // The cut: a wide bright arc carried over the shoulder, through the
  // target, and out past its hip — the whole path of the edge at once.
  arcGrid({ radius: 8, thickness: 3, from: 110, to: -55, ramp: ["T", "9", "9"] }),
  // The follow-through: shorter, thinner, already going out.
  arcGrid({ radius: 7, thickness: 1, from: 35, to: -75, ramp: ["6", "T"] }),
];

/* --- Tracer: the round in the air. One picture per authored slope,
 * bright head leading, amber tail behind it. --- */

const tracerFlat: PixelGrid = [".........", ".mmnn99..", "........."];

const tracerRise: PixelGrid = [
  "........9",
  "......99.",
  "....nn...",
  "..mm.....",
  "mm.......",
];

const tracerSteep: PixelGrid = [
  ".9.",
  ".9.",
  ".n.",
  ".n.",
  ".n.",
  ".n.",
  ".m.",
  ".m.",
  ".m.",
];

/** Top-to-bottom flip: an up-slope streak becomes the down-slope one. */
function flipped(grid: PixelGrid): string[] {
  return [...grid].reverse();
}

/** Mirrored art keeps its anchor on the same pixel of the picture. */
function mirrorAnchorX(width: number, anchorX: number): number {
  return width - 1 - anchorX;
}

const TRACER_FLAT_ANCHOR = { x: 4, y: 1 };
const TRACER_RISE_ANCHOR = { x: 4, y: 2 };
const TRACER_STEEP_ANCHOR = { x: 1, y: 4 };

function art(
  frames: readonly PixelGrid[],
  anchorX: number,
  anchorY: number,
  id: EffectSpriteId,
): EffectArt {
  return { frames, anchorX, anchorY, frameMs: EFFECT_TIMING[effectKind(id)].frameMs };
}

/**
 * Every effect picture, by id. Flat and eager like the other registries,
 * so validation tests can walk all of it and the gallery can list it.
 */
export const EFFECT_ART: Readonly<Record<EffectSpriteId, EffectArt>> = {
  "muzzle-flash": art(muzzleFlash, 4, 4, "muzzle-flash"),
  "spark-burst": art(sparkBurst, 5, 5, "spark-burst"),
  "wall-chip": art(wallChip, 5, 4, "wall-chip"),
  "impact-flash": art(impactFlash, 4, 4, "impact-flash"),
  "swipe-e": art(swipeEast, SWIPE_CENTER, SWIPE_CENTER, "swipe-e"),
  "swipe-w": art(
    swipeEast.map((grid) => mirrored(grid)),
    mirrorAnchorX(SWIPE_SIZE, SWIPE_CENTER),
    SWIPE_CENTER,
    "swipe-w",
  ),
  "tracer-e": art([tracerFlat], TRACER_FLAT_ANCHOR.x, TRACER_FLAT_ANCHOR.y, "tracer-e"),
  "tracer-w": art(
    [mirrored(tracerFlat)],
    mirrorAnchorX(tracerFlat[0]?.length ?? 0, TRACER_FLAT_ANCHOR.x),
    TRACER_FLAT_ANCHOR.y,
    "tracer-w",
  ),
  "tracer-ne": art([tracerRise], TRACER_RISE_ANCHOR.x, TRACER_RISE_ANCHOR.y, "tracer-ne"),
  "tracer-nw": art(
    [mirrored(tracerRise)],
    mirrorAnchorX(tracerRise[0]?.length ?? 0, TRACER_RISE_ANCHOR.x),
    TRACER_RISE_ANCHOR.y,
    "tracer-nw",
  ),
  "tracer-se": art(
    [flipped(tracerRise)],
    TRACER_RISE_ANCHOR.x,
    tracerRise.length - 1 - TRACER_RISE_ANCHOR.y,
    "tracer-se",
  ),
  "tracer-sw": art(
    [mirrored(flipped(tracerRise))],
    mirrorAnchorX(tracerRise[0]?.length ?? 0, TRACER_RISE_ANCHOR.x),
    tracerRise.length - 1 - TRACER_RISE_ANCHOR.y,
    "tracer-sw",
  ),
  "tracer-n": art([tracerSteep], TRACER_STEEP_ANCHOR.x, TRACER_STEEP_ANCHOR.y, "tracer-n"),
  "tracer-s": art(
    [flipped(tracerSteep)],
    TRACER_STEEP_ANCHOR.x,
    tracerSteep.length - 1 - TRACER_STEEP_ANCHOR.y,
    "tracer-s",
  ),
};

/** Every registered effect id, in registry order (for tests and dev). */
export const EFFECT_ART_IDS: readonly EffectSpriteId[] = EFFECT_SPRITE_IDS;
