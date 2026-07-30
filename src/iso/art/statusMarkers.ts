/**
 * Status marker art: the small glyph that sits over a combatant for as
 * long as a condition is true of it. One picture set per family (see
 * ../status.ts), never one per source — a body slowed by an ability and
 * a body slowed by a dose wear the same mark, because the player is
 * being told the same thing.
 *
 * Markers are read at a glance while something else is happening under
 * them, so they are tiny, they sit on their own center, and they loop
 * slowly. Their channels match the effect that most often causes them:
 * stun is the cyan of a shock arc, plating the chrome of a guard
 * shimmer, drive the magenta of a focus ring — so the mark left behind
 * looks like the thing that left it.
 */
import { STATUS_MARKERS, STATUS_FAMILY_IDS, type StatusFamilyId } from "../status";
import { TRANSPARENT } from "./palette";
import type { PixelGrid } from "./pixel";

/** One family's glyph frames plus the point they hang from. */
export interface StatusMarkerArt {
  readonly frames: readonly PixelGrid[];
  /** Anchor in 1x art pixels: the pixel that lands on the marker point. */
  readonly anchorX: number;
  readonly anchorY: number;
  /** Per-frame hold, from STATUS_MARKERS. */
  readonly frameMs: number;
}

/** Every marker is the same small square, so a row of them lines up. */
const MARKER_SIZE = 11;
const MARKER_CENTER = (MARKER_SIZE - 1) / 2;

/**
 * Four sparks going round a head that is not going to move this turn.
 * Generated so the orbit is a real orbit — squashed 2:1 like everything
 * else drawn flat on the iso grid — and so the four stay evenly spaced
 * however far round the loop has turned.
 */
function orbitFrame(turn: number): string[] {
  const cells = Array.from({ length: MARKER_SIZE }, () =>
    Array<string>(MARKER_SIZE).fill(TRANSPARENT),
  );
  for (let i = 0; i < 4; i++) {
    const angle = turn + (i / 4) * Math.PI * 2;
    const x = Math.round(MARKER_CENTER + Math.cos(angle) * 4);
    const y = Math.round(MARKER_CENTER + Math.sin(angle) * 4 * 0.55);
    const row = cells[y];
    if (!row || x < 0 || x >= MARKER_SIZE) continue;
    // The leading spark is the hot one; the rest are trailing it.
    row[x] = i === 0 ? "9" : "h";
  }
  return cells.map((row) => row.join(""));
}

const stunned: readonly PixelGrid[] = [0, 1, 2].map((i) =>
  orbitFrame((i / 3) * (Math.PI / 2)),
);

/* --- Guarded: a plate over the body, breathing slowly. --- */

const guarded: readonly PixelGrid[] = [
  [
    "...........",
    "...........",
    "...66666...",
    "..6.....6..",
    "..6.....6..",
    "..6.....6..",
    "..6.....6..",
    "..6.....6..",
    "...66666...",
    "...........",
    "...........",
  ],
  [
    "...........",
    "...........",
    "...99999...",
    "..T.....T..",
    "..T.....T..",
    "..T.....T..",
    "..T.....T..",
    "..T.....T..",
    "...TTTTT...",
    "...........",
    "...........",
  ],
];

/* --- Empowered: two chevrons, the lit one climbing. --- */

const empowered: readonly PixelGrid[] = [
  [
    "...........",
    "...........",
    "....lll....",
    "...l...l...",
    "..l.....l..",
    "...........",
    "....kkk....",
    "...k...k...",
    "..k.....k..",
    "...........",
    "...........",
  ],
  [
    "...........",
    "...........",
    "....kkk....",
    "...k...k...",
    "..k.....k..",
    "...........",
    "....lll....",
    "...l...l...",
    "..l.....l..",
    "...........",
    "...........",
  ],
];

function art(frames: readonly PixelGrid[], family: StatusFamilyId): StatusMarkerArt {
  return {
    frames,
    anchorX: MARKER_CENTER,
    anchorY: MARKER_CENTER,
    frameMs: STATUS_MARKERS[family].frameMs,
  };
}

/** Every status glyph, by family. Flat and eager like the other registries. */
export const STATUS_MARKER_ART: Readonly<
  Record<StatusFamilyId, StatusMarkerArt>
> = {
  stunned: art(stunned, "stunned"),
  guarded: art(guarded, "guarded"),
  empowered: art(empowered, "empowered"),
};

/** Every registered marker family, in registry order (tests and dev). */
export const STATUS_MARKER_IDS: readonly StatusFamilyId[] = STATUS_FAMILY_IDS;
