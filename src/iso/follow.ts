import { facingFromDelta, type Facing } from "./animation";
import { sameTile, type TilePoint, type WorldPoint } from "./coords";

/**
 * Trail-behind following, as pure state. A companion walking a map does
 * not path-find and does not steer: it walks the ground the player has
 * already walked, a couple of tiles back. Breadcrumbs, not pursuit.
 *
 * That choice is what makes it safe as well as cheap. Every tile in the
 * trail is a tile the player stood on, so a follower can never end up
 * inside a wall, on water, or stuck against a prop; it has no opinion
 * about interactables, so it can never take, block, or trigger one; and
 * it holds station a fixed gap back, so it never walks into the body it
 * is following.
 *
 * The scene owns the clock and the drawing (see ./scene.ts); everything
 * here is a pure function of state and elapsed time, and is tested
 * without a canvas.
 */

/** Tiles the follower keeps between itself and the player. */
export const FOLLOW_GAP = 2;

/**
 * Longest trail worth keeping. Past it the follower has fallen so far
 * behind — a long unbroken run, a stretch with the tab in the
 * background — that walking every breadcrumb would look like it was
 * lost. It cuts to the tail instead (see stepFollow).
 */
export const FOLLOW_TRAIL_LIMIT = 16;

/** Tiles per second a follower walks when it is not catching up. */
export const FOLLOW_SPEED = 3.5;

/**
 * Speed multiplier while more than the gap is owed. A follower that
 * only ever matched the leader's pace could never close a gap it had
 * lost, so it jogs — a little, not comically.
 */
export const FOLLOW_CATCH_UP = 1.5;

export interface FollowState {
  /** The tile it stands on, or the one it is stepping off. */
  tile: TilePoint;
  /** Interpolated position, in tile units, for drawing. */
  position: WorldPoint;
  facing: Facing;
  /**
   * Breadcrumbs still to walk, oldest first. The last entry is where
   * the leader is now, so `trail.length` is how far back the follower
   * is; anything at or below FOLLOW_GAP is "in formation".
   */
  trail: TilePoint[];
  /** 0..1 progress from `tile` toward `trail[0]`. */
  progress: number;
}

export interface FollowOptions {
  gap?: number;
  speed?: number;
  trailLimit?: number;
}

/** A follower standing on a tile with nothing owed — a fresh arrival. */
export function createFollowState(
  tile: TilePoint,
  facing: Facing = "s",
): FollowState {
  return {
    tile: { x: tile.x, y: tile.y },
    position: { x: tile.x, y: tile.y },
    facing,
    trail: [],
    progress: 0,
  };
}

/**
 * Records the leader entering a tile. Repeats of the tile already at
 * the head of the trail (and of the follower's own standing tile, when
 * the trail is empty) are dropped, so a scene may call this every frame
 * and only real steps land.
 */
export function leaderEntered(
  state: FollowState,
  tile: TilePoint,
): FollowState {
  const head = state.trail[state.trail.length - 1] ?? state.tile;
  if (sameTile(head, tile)) return state;
  return { ...state, trail: [...state.trail, { x: tile.x, y: tile.y }] };
}

/**
 * Advances the follower by `dt` seconds. It walks breadcrumbs while it
 * owes more than the gap and holds still once it is back in formation,
 * which is what makes it stop a tile or two short of the player rather
 * than treading on their heels.
 */
export function stepFollow(
  state: FollowState,
  dt: number,
  options: FollowOptions = {},
): FollowState {
  const gap = options.gap ?? FOLLOW_GAP;
  const limit = options.trailLimit ?? FOLLOW_TRAIL_LIMIT;
  const speed = options.speed ?? FOLLOW_SPEED;

  let { tile, facing, trail, progress } = state;

  // Hopelessly behind: cut to the tail and pick the walk up from there
  // rather than retracing a route the player left minutes ago.
  if (trail.length > limit) {
    trail = trail.slice(trail.length - limit);
    tile = trail[0] ?? tile;
    progress = 0;
  } else {
    trail = [...trail];
  }

  const owed = (): number => trail.length;
  if (owed() <= gap) {
    return {
      tile,
      position: { x: tile.x, y: tile.y },
      facing,
      trail,
      progress: 0,
    };
  }

  const pace = owed() > gap + 1 ? speed * FOLLOW_CATCH_UP : speed;
  progress += pace * dt;
  while (progress >= 1 && owed() > gap) {
    progress -= 1;
    tile = trail.shift() ?? tile;
  }

  const next = owed() > gap ? trail[0] : undefined;
  if (!next) {
    return {
      tile,
      position: { x: tile.x, y: tile.y },
      facing,
      trail,
      progress: 0,
    };
  }
  facing = facingFromDelta(next.x - tile.x, next.y - tile.y) ?? facing;
  return {
    tile,
    position: {
      x: tile.x + (next.x - tile.x) * progress,
      y: tile.y + (next.y - tile.y) * progress,
    },
    facing,
    trail,
    progress,
  };
}

/** True while the follower is walking (drives its walk animation). */
export function isFollowMoving(
  state: FollowState,
  options: FollowOptions = {},
): boolean {
  return state.trail.length > (options.gap ?? FOLLOW_GAP);
}
