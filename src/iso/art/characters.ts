/**
 * Character pixel art: one authored 16×24 humanoid (front and back
 * three-quarter views, idle + stride poses). The four iso facings come
 * from horizontal mirroring (e↔s share the front view, n↔w the back),
 * walk cycles from leg-row swaps and a 1px bob, and the player / enemy /
 * NPC roles from palette remaps of the same grids — so the whole cast
 * stays a single reviewable set of drawings.
 *
 * Jacket uses "i" (dim) with a "g"/"h" neon seam; role remaps recolor
 * those. Anchor is the shadow center: (8, 22) in 1x pixels.
 */
import type { Facing, MotionState } from "../animation";
import { mirrored, type PixelGrid } from "./pixel";

export type CharacterRole = "player" | "enemy" | "npc";

export const CHARACTER_ANCHOR_X = 8;
export const CHARACTER_ANCHOR_Y = 22;

const BLANK = "................";

/** Head + torso, facing down-right (rows 0-14). */
const frontTop: readonly string[] = [
  BLANK,
  BLANK,
  ".....000000.....",
  "....01111110....",
  "....01111110....",
  "....0rqggg90....",
  "....0rqqqqq0....",
  ".....0rqqq0.....",
  "...00iiiiii00...",
  "..0iiiiiiiiii0..",
  "..0i1iiigii1i0..",
  "..0i1iiigii1i0..",
  "..0i1iiigii1i0..",
  "..0q1iiigii1q0..",
  "...05555m5550...",
];

/** Head + torso, facing up-right — back of the head, collar seam. */
const backTop: readonly string[] = [
  BLANK,
  BLANK,
  ".....000000.....",
  "....01111110....",
  "....01111110....",
  "....01111110....",
  "....01111110....",
  ".....011110.....",
  "...00iiiiii00...",
  "..0iiigggiiii0..",
  "..0i1iiiiii1i0..",
  "..0i1iiiiii1i0..",
  "..0i1iiiiii1i0..",
  "..0q1iiiiii1q0..",
  "...0555555550...",
];

/** Standing legs + shadow (rows 15-23). */
const legsIdle: readonly string[] = [
  "....022212220...",
  "....022212220...",
  "....022212220...",
  "....022212220...",
  "....022212220...",
  "....011101110...",
  "....011101110...",
  "...zzzzzzzzzz...",
  BLANK,
];

/** Mid-stride legs: rear leg lifted, lead leg extended. */
const legsStride: readonly string[] = [
  "....022212220...",
  "....02220.2220..",
  "....01110..2220.",
  "...........2220.",
  "..........01110.",
  "..........01110.",
  BLANK,
  "...zzzzzzzzzz...",
  BLANK,
];

/** Whole body pushed down 1px (shadow stays put) — breathe / walk bob. */
function bobbed(grid: PixelGrid): string[] {
  return [BLANK, ...grid.slice(0, 21), ...grid.slice(22)];
}

/** Mirror only the leg rows, keeping the facing of the upper body. */
function otherStride(grid: PixelGrid): string[] {
  return grid.map((row, i) =>
    i >= 15 && i <= 21 ? [...row].reverse().join("") : row,
  );
}

function facingFrames(top: readonly string[]): Record<MotionState, PixelGrid[]> {
  const idle = [...top, ...legsIdle];
  const stride = [...top, ...legsStride];
  return {
    idle: [idle, bobbed(idle)],
    walk: [stride, bobbed(idle), otherStride(stride), bobbed(idle)],
  };
}

const east = facingFrames(frontTop);
const north = facingFrames(backTop);

function mirroredFrames(
  frames: Record<MotionState, PixelGrid[]>,
): Record<MotionState, PixelGrid[]> {
  return {
    idle: frames.idle.map(mirrored),
    walk: frames.walk.map(mirrored),
  };
}

/** Frame sets per facing and motion state; all frames 16×24. */
export const CHARACTER_FRAMES: Readonly<
  Record<Facing, Record<MotionState, PixelGrid[]>>
> = {
  e: east,
  s: mirroredFrames(east),
  n: north,
  w: mirroredFrames(north),
};

/** Palette remaps giving each role its own jacket and accent colors. */
export const ROLE_REMAPS: Readonly<
  Record<CharacterRole, Readonly<Record<string, string>>>
> = {
  player: {},
  enemy: { i: "l", g: "j", h: "k", "9": "k" },
  npc: { i: "4", g: "m", h: "n", "9": "n" },
};
