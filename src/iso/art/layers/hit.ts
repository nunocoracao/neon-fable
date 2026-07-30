/**
 * Hit reactions and deaths for the layered character: the one-shot pose
 * sets a combatant plays when a blow lands on it. Like the walk, idle,
 * and attack sets, these are derived by pure transforms over the
 * composed neutral pose rather than hand-drawn duplicate bodies — so
 * every outfit, face, weapon, and chrome overlay flinches and falls
 * with the body that wears it, with nothing authored twice.
 *
 * ## Hits: a recoil, in two magnitudes
 *
 * A flinch shifts the head band and the torso band away from whatever
 * landed the blow, the head travelling further than the chest, then
 * lets both come most of the way back. A shudder is the same shape at
 * half the travel with a jitter back into the blow — what a body does
 * when its plating took the worse half of it (isGlancingBlow in
 * ../../../combat/damage decides which one plays).
 *
 * Legs, feet, and the ground shadow are never touched: a hit staggers
 * the upper body without moving the character off its tile.
 *
 * ## Deaths: folding onto the shadow
 *
 * A death crumples the whole figure down onto its own footprint. Every
 * body row is re-laid at a fraction of its standing height and leaned
 * over as it goes, painted bottom-up so the head and chest come to rest
 * on top of the legs. The last frame is the heap, and the heap is what
 * the tile looks like for the rest of the encounter.
 *
 * A drone sparks out instead: a chassis has no knees to buckle, so it
 * drops straighter and faster and throws sparks while it goes. The
 * sparks burn in the neon amber pair (m/n) the muzzle flash uses —
 * fire is its own light, never a material — inside SPARK_REGION, clear
 * of the shadow rows.
 *
 * The (16, 44) anchor and the shadow rows survive every frame of every
 * reaction, so nothing here can drift a character off its tile.
 */
import { hash2 } from "../../animation";
import {
  reactionFrameCount,
  type DeathReactionKind,
  type HitReactionKind,
  type ReactionKind,
} from "../../reaction";
import { rowsShifted, type PixelGrid } from "../pixel";
import { BODY_FRAME } from "./body";

/** Last body row: the boot line the whole figure folds onto. */
const GROUND_ROW = 42;

/** Bottom of the recoiling torso band; the hips and legs below it hold. */
const TORSO_BOTTOM = 30;

/**
 * How much of its standing height a fully-fallen body keeps. A heap is
 * flat, not gone: enough rows survive to read as a body on the floor.
 */
const HEAP_HEIGHT = 0.28;

/** Rows and columns a spark may burn in; clear of the shadow band. */
export const SPARK_REGION = {
  top: 24,
  bottom: GROUND_ROW,
  left: 4,
  right: BODY_FRAME.width - 5,
} as const;

/** The amber pair sparks burn in: bright core, cooling edge. */
const SPARK_HOT = "n";
const SPARK_COOL = "m";

/** One frame of a hit reaction: how far each band is thrown. */
export interface HitFrame {
  /** Head-and-neck displacement, in pixels away from the attacker. */
  readonly headDx: number;
  /** Chest-to-belt displacement; always the smaller of the two. */
  readonly torsoDx: number;
}

/**
 * The authored hit sets. A solid blow snaps the head two pixels off the
 * attacker with the chest following, then recovers; an armored one
 * gives a pixel and shrugs back into it.
 */
export const HIT_FRAMES: Readonly<Record<HitReactionKind, readonly HitFrame[]>> =
  {
    flinch: [
      { headDx: 2, torsoDx: 1 },
      { headDx: 1, torsoDx: 0 },
    ],
    shudder: [
      { headDx: 1, torsoDx: 1 },
      { headDx: -1, torsoDx: 0 },
    ],
  };

/** One frame of a death: how far the figure has fallen, and how sparky. */
export interface FallFrame {
  /** 0 = standing, 1 = fully folded onto the shadow. */
  readonly fall: number;
  /** Pixels the top of the body leans over at this frame. */
  readonly lean: number;
  /** Sparks thrown on this frame; only chassis deaths throw any. */
  readonly sparks?: number;
}

/**
 * The authored death sets. A body buckles, folds, goes over, and
 * settles; a chassis drops nearly straight down in three beats and
 * stops dead, spitting charge the whole way and going dark on the heap.
 */
export const FALL_FRAMES: Readonly<
  Record<DeathReactionKind, readonly FallFrame[]>
> = {
  collapse: [
    { fall: 0.25, lean: 1 },
    { fall: 0.55, lean: 3 },
    { fall: 0.8, lean: 6 },
    { fall: 1, lean: 8 },
  ],
  sparkout: [
    { fall: 0.35, lean: 0, sparks: 7 },
    { fall: 0.7, lean: 1, sparks: 9 },
    { fall: 0.92, lean: 2, sparks: 5 },
    { fall: 1, lean: 3 },
  ],
};

const BLANK = ".".repeat(BODY_FRAME.width);

/** Overwrite one cell of a row array of strings, ignoring the frame edges. */
function setCell(rows: string[], r: number, c: number, ch: string): void {
  if (r < 0 || r >= rows.length || c < 0 || c >= BODY_FRAME.width) return;
  const row = rows[r] ?? BLANK;
  rows[r] = row.slice(0, c) + ch + row.slice(c + 1);
}

/**
 * The upper body thrown sideways: the head band (skull through neck)
 * travels one way, the torso band under it a shorter distance, and
 * everything from the hips down stays exactly where it was standing.
 */
function recoiled(grid: PixelGrid, headDx: number, torsoDx: number): string[] {
  const head = rowsShifted(grid, 0, BODY_FRAME.neck.bottom, headDx);
  return rowsShifted(head, BODY_FRAME.neck.bottom + 1, TORSO_BOTTOM, torsoDx);
}

/**
 * The figure folded down onto its own shadow. Each row is re-laid at
 * `fall` of the way to the ground and leaned proportionally to how high
 * it started — the head goes furthest over, the boots not at all — and
 * rows are painted from the feet up, so the chest and skull come to
 * rest on top of the legs rather than under them.
 */
function crumpled(
  grid: PixelGrid,
  fall: number,
  lean: number,
  awayX: -1 | 1,
): string[] {
  const out = grid.map((row, r) => (r <= GROUND_ROW ? BLANK : row));
  const squash = 1 - fall * (1 - HEAP_HEIGHT);
  for (let r = GROUND_ROW; r >= 0; r--) {
    const row = grid[r];
    if (!row) continue;
    const height = GROUND_ROW - r;
    const dstRow = GROUND_ROW - Math.round(height * squash);
    const dx = Math.round((lean * height) / GROUND_ROW) * awayX;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c] ?? ".";
      if (ch !== ".") setCell(out, dstRow, c + dx, ch);
    }
  }
  return out;
}

/**
 * Charge thrown off a dying chassis: a deterministic scatter inside
 * SPARK_REGION, biased along the direction the shell is going over.
 * Same frame, same sparks — a death replays identically — and the whole
 * spray flips with the throw, so a shell knocked left sparks as the
 * mirror of one knocked right.
 */
function sparked(
  rows: string[],
  frame: number,
  count: number,
  awayX: -1 | 1,
): string[] {
  const out = [...rows];
  const width = SPARK_REGION.right - SPARK_REGION.left + 1;
  const height = SPARK_REGION.bottom - SPARK_REGION.top + 1;
  for (let i = 0; i < count; i++) {
    const h = hash2(frame * 37 + i, 911);
    const scattered = SPARK_REGION.left + (h % width);
    const x = awayX === 1 ? scattered : BODY_FRAME.width - 1 - scattered;
    const y = SPARK_REGION.top + ((h >>> 8) % height);
    // Half the scatter drifts the way the shell is falling, which keeps
    // the spray from reading as a symmetric halo.
    const drift = (h >>> 16) % 2 === 0 ? awayX : 0;
    setCell(
      out,
      y,
      Math.min(SPARK_REGION.right, Math.max(SPARK_REGION.left, x + drift)),
      i % 3 === 0 ? SPARK_HOT : SPARK_COOL,
    );
  }
  return out;
}

/** The authored frame, or a clear error naming the reaction's real count. */
function requireFrame(kind: ReactionKind, frame: number): void {
  if (frame < 0 || frame >= reactionFrameCount(kind)) {
    throw new Error(
      `no ${kind} reaction frame ${frame} (have ${reactionFrameCount(kind)})`,
    );
  }
}

/**
 * One frame of a reaction, applied to a composed character. `awayX` is
 * the screen-x direction away from whoever landed the blow, so callers
 * pass a grid that has already been mirrored for its facing — a body
 * shoved to the right is shoved to the right whichever way it faces.
 */
export function reactionFrameGrid(
  grid: PixelGrid,
  kind: ReactionKind,
  frame: number,
  awayX: -1 | 1,
): PixelGrid {
  requireFrame(kind, frame);
  if (kind === "flinch" || kind === "shudder") {
    const authored = HIT_FRAMES[kind][frame] as HitFrame;
    return recoiled(grid, authored.headDx * awayX, authored.torsoDx * awayX);
  }
  const authored = FALL_FRAMES[kind][frame] as FallFrame;
  const fallen = crumpled(grid, authored.fall, authored.lean, awayX);
  return authored.sparks === undefined
    ? fallen
    : sparked(fallen, frame, authored.sparks, awayX);
}
