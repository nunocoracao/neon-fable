/**
 * Patrol stepping: a beat of waypoints in, one tile-and-facing per tick
 * out, forever.
 *
 * The whole route is expanded once into a closed list of ticks and then
 * indexed modulo its own length, so where a guard is at tick 10_000 is
 * the same question as where they are at tick 4 — no accumulated state,
 * no drift, and a scene that is left and come back to picks the patrol
 * up exactly where the clock says it should be. Nothing here reads a
 * wall clock or an RNG: two runs on the same tick agree to the tile.
 */
import { facingFromDelta, type Facing } from "../iso/animation";
import type { TilePoint } from "../iso/coords";
import type { PatrolRoute, PatrolWaypoint } from "../data/stealth";

/** Where a guard is on one tick, and which way they are looking. */
export interface PatrolStep extends TilePoint {
  facing: Facing;
}

/** Where a guard is *between* ticks, for drawing them walking. */
export interface PatrolPoint {
  /** Fractional tile position along the leg being walked. */
  x: number;
  y: number;
  facing: Facing;
  /** False while standing at a waypoint's dwell. */
  moving: boolean;
}

export class PatrolError extends Error {
  constructor(
    readonly code: "diagonal-leg" | "empty-route",
    message: string,
  ) {
    super(message);
    this.name = "PatrolError";
  }
}

/**
 * The order waypoints are visited in over one closed cycle. A "cycle"
 * route runs the list and walks back to the head; a "pingpong" route
 * runs it and retraces all but the ends, so both close and neither
 * repeats a turn-round tick.
 */
function visitOrder(route: PatrolRoute): number[] {
  const count = route.waypoints.length;
  const forward = [...Array(count).keys()];
  if ((route.loop ?? "pingpong") === "cycle" || count <= 2) return forward;
  const back = forward.slice(1, count - 1).reverse();
  return [...forward, ...back];
}

/** The tiles strictly between two waypoints on an axis-aligned leg. */
function legTiles(from: TilePoint, to: TilePoint): TilePoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx !== 0 && dy !== 0) {
    throw new PatrolError(
      "diagonal-leg",
      `Patrol leg (${from.x}, ${from.y}) -> (${to.x}, ${to.y}) is not axis-aligned`,
    );
  }
  const length = Math.abs(dx) + Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const tiles: TilePoint[] = [];
  for (let i = 1; i < length; i++) {
    tiles.push({ x: from.x + stepX * i, y: from.y + stepY * i });
  }
  return tiles;
}

/**
 * Expanded routes, kept with the route object they came from. Routes
 * are static content, so the expansion is a pure function of identity —
 * and the scene asks for a guard's tile every frame, which is the only
 * reason this is worth caching at all.
 */
const expanded = new WeakMap<PatrolRoute, PatrolStep[]>();

/**
 * One tick per entry, closed: the last entry's successor is the first.
 * A waypoint occupies `1 + dwell` ticks and is looked out of the way it
 * declares, or — failing that — the way its guard is about to walk.
 */
export function patrolSteps(route: PatrolRoute): PatrolStep[] {
  const cached = expanded.get(route);
  if (cached) return cached;
  const steps = buildSteps(route);
  expanded.set(route, steps);
  return steps;
}

function buildSteps(route: PatrolRoute): PatrolStep[] {
  const waypoints = route.waypoints;
  if (waypoints.length === 0) {
    throw new PatrolError("empty-route", "A patrol route needs a waypoint");
  }
  const order = visitOrder(route);
  const steps: PatrolStep[] = [];
  let facing: Facing = waypoints[order[0]!]!.facing ?? "s";
  for (let i = 0; i < order.length; i++) {
    const here: PatrolWaypoint = waypoints[order[i]!]!;
    const next: PatrolWaypoint = waypoints[order[(i + 1) % order.length]!]!;
    const heading = facingFromDelta(next.x - here.x, next.y - here.y);
    if (heading) facing = heading;
    const stand = here.facing ?? facing;
    const hold = 1 + Math.max(0, Math.trunc(here.dwell ?? 0));
    for (let h = 0; h < hold; h++) {
      steps.push({ x: here.x, y: here.y, facing: stand });
    }
    for (const tile of legTiles(here, next)) {
      steps.push({ x: tile.x, y: tile.y, facing });
    }
  }
  return steps;
}

/** How many ticks one full circuit of a route takes. */
export function patrolCycleLength(route: PatrolRoute): number {
  return patrolSteps(route).length;
}

/** Where a route puts its guard on a tick; negative ticks wrap too. */
export function patrolStepAt(route: PatrolRoute, tick: number): PatrolStep {
  const steps = patrolSteps(route);
  const length = steps.length;
  const index = ((Math.floor(tick) % length) + length) % length;
  return steps[index]!;
}

/**
 * Where to draw a guard at a fractional tick: linearly along the leg
 * between this tick's tile and the next one's. Consecutive steps are
 * always the same tile or an adjacent one, so the interpolation is
 * always a single tile of travel and a guard never appears to skate.
 */
export function patrolPointAt(route: PatrolRoute, tick: number): PatrolPoint {
  const steps = patrolSteps(route);
  const length = steps.length;
  const floor = Math.floor(tick);
  const progress = tick - floor;
  const index = ((floor % length) + length) % length;
  const here = steps[index]!;
  const next = steps[(index + 1) % length]!;
  const moving = here.x !== next.x || here.y !== next.y;
  return {
    x: here.x + (next.x - here.x) * progress,
    y: here.y + (next.y - here.y) * progress,
    facing: here.facing,
    moving,
  };
}
