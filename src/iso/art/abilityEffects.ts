/**
 * Ability effect art: the arc a shock ability lays across the room, the
 * glare an optic spike goes off as, the weight a crush arrives with, the
 * mesh a net closes as, the coolant hanging over a tile, and the two
 * auras a self-buff lights up in. Authored as palette-indexed grids like
 * everything else and baked through the sprite provider — there is no
 * particle system here, only frames the pure math in ../abilityFx.ts
 * positions and picks between.
 *
 * ## Generated, not plotted
 *
 * Rings, spokes, lattices, and drifting dither are geometry, and a hand
 * plot of geometry is a hand plot of rounding errors. Everything here is
 * generated from a handful of primitives (ring, spokes, hex cells, a
 * hashed dither) so a circle is a real circle at any radius, the frames
 * of one set stay concentric, and changing a radius does not mean
 * redrawing a picture. Ellipses are squashed 2:1 like everything else on
 * the iso grid, so a ring around a body lies on the floor rather than
 * standing up off it.
 *
 * ## Anchors
 *
 * Every set is anchored on its own center: a burst is centered on the
 * chest it goes off against, an aura on the body it wraps, and a beam
 * segment on the point in the chain it was placed at. Nothing here
 * stands on a tile.
 *
 * ## Channels
 *
 * Each archetype owns a channel family, and that is most of what tells
 * them apart at a glance:
 *
 * - shock arc — neon cyan (i/g/h) over a white-ink core. Electricity.
 * - volley streak — neon amber (o/m/n) with white cores, the same fire
 *   the muzzle flashes and tracers in ./effects burn in.
 * - optic flash — hologram blue (s/t/u). A broadcast, not a fire.
 * - kinetic slam — chrome and concrete (6/8/9/Q/R/S). Weight arriving
 *   is not a light source, so nothing in it is lit.
 * - snare mesh — hazard amber wire (Y/Z/n) strung on cyan shock nodes.
 * - nano cloud — the glass/water ramp (f/U/h) with chrome grit.
 * - guard shimmer — brushed chrome (6/T/9) with a cyan glint.
 * - focus ring — neon magenta (l/j/k), the one aura that is not plating.
 */
import { hash2 } from "../animation";
import { ABILITY_FX, type AbilityFxId } from "../abilityFx";
import { TRANSPARENT } from "./palette";
import type { PixelGrid } from "./pixel";

/** One archetype's frames plus the point they are anchored on. */
export interface AbilityFxArt {
  readonly frames: readonly PixelGrid[];
  /** Anchor in 1x art pixels: the pixel that lands on the effect point. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Per-frame hold, from ABILITY_FX. */
  readonly frameMs: number;
}

/* --- Grid primitives ------------------------------------------------ */

type Cells = string[][];

function blank(width: number, height: number): Cells {
  return Array.from({ length: height }, () => Array<string>(width).fill(TRANSPARENT));
}

function put(cells: Cells, x: number, y: number, ch: string): void {
  const row = cells[Math.round(y)];
  const col = Math.round(x);
  if (!row || col < 0 || col >= row.length) return;
  row[col] = ch;
}

function rows(cells: Cells): string[] {
  return cells.map((row) => row.join(""));
}

/** An iso-squashed ellipse outline, walked at a fine enough step to close. */
function ring(
  cells: Cells,
  cx: number,
  cy: number,
  radius: number,
  ch: string,
  squashY = 0.5,
): void {
  const steps = Math.max(24, Math.round(radius * 12));
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    put(cells, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * squashY, ch);
  }
}

/** Radial spokes from an inner to an outer radius, evenly spaced. */
function spokes(
  cells: Cells,
  cx: number,
  cy: number,
  count: number,
  inner: number,
  outer: number,
  ch: string,
  squashY = 1,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    for (let r = inner; r <= outer; r += 0.5) {
      put(cells, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * squashY, ch);
    }
  }
}

/**
 * A four-armed spark: a core, arms out to `radius`, and tips a step
 * short of them on the other diagonal. `turned` swings the whole thing
 * 45°, which is how one frame of a crackle differs from the next.
 */
function sparkNode(
  size: number,
  radius: number,
  core: string,
  arm: string,
  tip: string,
  turned = false,
): string[] {
  const cells = blank(size, size);
  const c = (size - 1) / 2;
  const armAngle = turned ? Math.PI / 4 : 0;
  for (let i = 0; i < 4; i++) {
    const angle = armAngle + (i / 4) * Math.PI * 2;
    for (let r = 1; r <= radius; r += 0.5) {
      put(cells, c + Math.cos(angle) * r, c + Math.sin(angle) * r, arm);
    }
    const tipAngle = angle + Math.PI / 4;
    const tipRadius = Math.max(1, radius - 1);
    put(
      cells,
      c + Math.cos(tipAngle) * tipRadius,
      c + Math.sin(tipAngle) * tipRadius,
      tip,
    );
  }
  put(cells, c, c, core);
  return rows(cells);
}

/** A honeycomb cell, 5×5, drawn as an outline. */
const HEX_CELL: readonly string[] = [".###.", "#...#", "#...#", "#...#", ".###."];

/**
 * Hex cells tiled on a staggered grid, but only around the *edge* of a
 * body-sized ellipse — plating comes up around a figure, it does not
 * paint over its face. Cells whose center falls inside the lit band take
 * the bright character, so a glint travels up the shell by moving the
 * band rather than by redrawing the lattice.
 */
function hexLattice(
  width: number,
  height: number,
  bandY: number,
  dim: string,
  lit: string,
): string[] {
  const cells = blank(width, height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const stepX = 6;
  const stepY = 5;
  for (let row = -2; row <= 2; row++) {
    const hy = cy + row * stepY;
    const stagger = row % 2 === 0 ? 0 : stepX / 2;
    for (let col = -2; col <= 2; col++) {
      const hx = cx + col * stepX + stagger;
      // The shell only: an ellipse the size of a 32×48 figure seen from
      // the chest, with its middle left clear.
      const nx = (hx - cx) / (width / 2);
      const ny = (hy - cy) / (height / 2);
      const radius = nx * nx + ny * ny;
      if (radius > 1 || radius < 0.34) continue;
      const ch = Math.abs(hy - bandY) <= 3 ? lit : dim;
      HEX_CELL.forEach((line, dy) => {
        [...line].forEach((mark, dx) => {
          if (mark === "#") put(cells, hx - 2 + dx, hy - 2 + dy, ch);
        });
      });
    }
  }
  return rows(cells);
}

/**
 * A drifting dither cloud: an ellipse of hashed pixels, thicker at the
 * middle than the edge, whose pattern is a pure function of the frame —
 * so it churns without ever being random.
 */
function ditherCloud(
  width: number,
  height: number,
  frame: number,
  ramp: readonly string[],
): string[] {
  const cells = blank(width, height);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / (width / 2);
      const ny = (y - cy) / (height / 2);
      const falloff = nx * nx + ny * ny;
      if (falloff > 1) continue;
      // Drift: the pattern slides a pixel per frame and re-rolls, which
      // reads as the cloud rolling over rather than blinking. Thin
      // enough at every step to see the body through it — a cloud that
      // hides what it is sitting on is a hole in the arena.
      const noise = hash2(x - frame, y + frame * 3) % 100;
      const density = 55 - falloff * 45;
      if (noise > density) continue;
      const step = Math.min(ramp.length - 1, Math.floor(falloff * ramp.length));
      const color = ramp[ramp.length - 1 - step] ?? ramp[0];
      if (color) put(cells, x, y, color);
    }
  }
  return rows(cells);
}

/* --- Shock arc: one link of the chain, laid close enough along the
 * line that the links run together into a rope of static. Each frame
 * swings the crackle round, which is what makes the whole arc writhe
 * without any of it moving. --- */

const SEGMENT_SIZE = 9;

const shockArc: readonly PixelGrid[] = [
  sparkNode(SEGMENT_SIZE, 3, "9", "g", "h"),
  sparkNode(SEGMENT_SIZE, 3, "9", "h", "g", true),
  sparkNode(SEGMENT_SIZE, 2, "h", "i", "g"),
];

/* --- Volley streak: the rounds crossing the line, three beats of it,
 * spaced far enough apart to read as separate shots. --- */

const volleyStreak: readonly PixelGrid[] = [
  sparkNode(SEGMENT_SIZE, 4, "9", "n", "m"),
  sparkNode(SEGMENT_SIZE, 3, "n", "m", "m", true),
  sparkNode(SEGMENT_SIZE, 2, "m", "o", "o"),
];

/* --- Optic flash: a glare going off in somebody's face --------------- */

const BURST_SIZE = 17;
const BURST_CENTER = (BURST_SIZE - 1) / 2;

function opticFlashFrame(
  ringRadius: number,
  spokeOuter: number,
  ringChar: string,
  spokeChar: string,
  core: string | null,
): string[] {
  const cells = blank(BURST_SIZE, BURST_SIZE);
  ring(cells, BURST_CENTER, BURST_CENTER, ringRadius, ringChar, 0.7);
  spokes(cells, BURST_CENTER, BURST_CENTER, 8, ringRadius + 1, spokeOuter, spokeChar, 0.7);
  if (core) {
    spokes(cells, BURST_CENTER, BURST_CENTER, 4, 0, ringRadius - 1, core, 0.7);
    put(cells, BURST_CENTER, BURST_CENTER, core);
  }
  return rows(cells);
}

const opticFlash: readonly PixelGrid[] = [
  opticFlashFrame(2, 5, "9", "u", "9"),
  opticFlashFrame(5, 7, "u", "t", "u"),
  opticFlashFrame(7, 8, "t", "s", null),
];

/* --- Kinetic slam: weight arriving, and what it knocks loose --------- */

function kineticSlamFrame(
  radius: number,
  ringChar: string,
  crackChar: string,
  gritChar: string | null,
): string[] {
  const cells = blank(BURST_SIZE, BURST_SIZE);
  ring(cells, BURST_CENTER, BURST_CENTER, radius, ringChar, 0.6);
  spokes(cells, BURST_CENTER, BURST_CENTER, 6, 1, radius - 1, crackChar, 0.6);
  if (gritChar) {
    // Fragments thrown clear of the ring, on the diagonals.
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      put(
        cells,
        BURST_CENTER + dx * (radius + 2),
        BURST_CENTER + dy * (radius + 1) * 0.6,
        gritChar,
      );
    }
  }
  return rows(cells);
}

const kineticSlam: readonly PixelGrid[] = [
  kineticSlamFrame(3, "9", "8", null),
  kineticSlamFrame(5, "8", "S", "R"),
  kineticSlamFrame(7, "6", "R", "Q"),
];

/* --- Snare mesh: a shock net thrown open, then drawn tight ----------- */

function snareMeshFrame(
  radius: number,
  wire: string,
  node: string,
  step: number,
): string[] {
  const cells = blank(BURST_SIZE, BURST_SIZE);
  for (let y = 0; y < BURST_SIZE; y++) {
    for (let x = 0; x < BURST_SIZE; x++) {
      const nx = (x - BURST_CENTER) / radius;
      const ny = (y - BURST_CENTER) / (radius * 0.75);
      if (nx * nx + ny * ny > 1) continue;
      const onWarp = (x + y) % step === 0;
      const onWeft = (x - y + BURST_SIZE * step) % step === 0;
      if (onWarp && onWeft) put(cells, x, y, node);
      else if (onWarp || onWeft) put(cells, x, y, wire);
    }
  }
  return rows(cells);
}

const snareMesh: readonly PixelGrid[] = [
  snareMeshFrame(8, "Y", "Z", 5),
  snareMeshFrame(6, "Z", "n", 4),
  snareMeshFrame(4, "n", "g", 3),
];

/* --- Nano cloud: coolant hanging over a tile, rolling over ----------- */

const CLOUD_W = 19;
const CLOUD_H = 15;
const CLOUD_RAMP = ["h", "U", "f", "8"] as const;

const nanoCloud: readonly PixelGrid[] = [0, 1, 2, 3].map((frame) =>
  ditherCloud(CLOUD_W, CLOUD_H, frame, CLOUD_RAMP),
);

/* --- Guard shimmer: plating coming up around a body ------------------ */

const AURA_W = 25;
const AURA_H = 33;
const AURA_CENTER_X = (AURA_W - 1) / 2;
const AURA_CENTER_Y = (AURA_H - 1) / 2;

const guardShimmer: readonly PixelGrid[] = [
  hexLattice(AURA_W, AURA_H, AURA_CENTER_Y + 9, "6", "T"),
  hexLattice(AURA_W, AURA_H, AURA_CENTER_Y, "6", "9"),
  hexLattice(AURA_W, AURA_H, AURA_CENTER_Y - 9, "6", "T"),
];

/* --- Focus ring: the world slowing down, one ring at a time ---------- */

/** Three rings up the body; the lit one is the one currently rising. */
function focusRingFrame(litIndex: number): string[] {
  const cells = blank(AURA_W, AURA_H);
  const heights = [AURA_CENTER_Y + 9, AURA_CENTER_Y, AURA_CENTER_Y - 9];
  // Barely narrowing as they climb: three rings of much the same size,
  // so the set stays balanced on its own center whichever one is lit.
  const radii = [9, 8, 7];
  heights.forEach((y, i) => {
    const radius = radii[i] ?? 5;
    // The lit ring is the one rising now; the ones under it have been
    // and gone, the ones over it have not been reached. Same pixels in
    // every frame, so the set never leans off its own center.
    const ch = i === litIndex ? "k" : i < litIndex ? "l" : "j";
    ring(cells, AURA_CENTER_X, y, radius, ch, 0.4);
  });
  return rows(cells);
}

const focusRing: readonly PixelGrid[] = [0, 1, 2].map(focusRingFrame);

/* --- Registry -------------------------------------------------------- */

function art(
  frames: readonly PixelGrid[],
  anchorX: number,
  anchorY: number,
  id: AbilityFxId,
): AbilityFxArt {
  return { frames, anchorX, anchorY, frameMs: ABILITY_FX[id].frameMs };
}

/**
 * Every ability effect picture, by archetype id. Flat and eager like the
 * other registries, so validation tests can walk all of it and the
 * gallery can list it.
 */
export const ABILITY_FX_ART: Readonly<Record<AbilityFxId, AbilityFxArt>> = {
  "shock-arc": art(shockArc, 4, 4, "shock-arc"),
  "volley-streak": art(volleyStreak, 4, 4, "volley-streak"),
  "optic-flash": art(opticFlash, BURST_CENTER, BURST_CENTER, "optic-flash"),
  "kinetic-slam": art(kineticSlam, BURST_CENTER, BURST_CENTER, "kinetic-slam"),
  "snare-mesh": art(snareMesh, BURST_CENTER, BURST_CENTER, "snare-mesh"),
  "nano-cloud": art(nanoCloud, (CLOUD_W - 1) / 2, (CLOUD_H - 1) / 2, "nano-cloud"),
  "guard-shimmer": art(guardShimmer, AURA_CENTER_X, AURA_CENTER_Y, "guard-shimmer"),
  "focus-ring": art(focusRing, AURA_CENTER_X, AURA_CENTER_Y, "focus-ring"),
};
