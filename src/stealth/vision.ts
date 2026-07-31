/**
 * What a guard can see: the cone their facing carves out of the grid,
 * cut back to what the map actually lets light through.
 *
 * Pure geometry over an IsoMap — no game state, no clock, no canvas.
 * The cone is derived rather than authored so a route's readability is
 * a property of the numbers on the guard (range and spread) and of the
 * walls around them, and never of a hand-listed tile set that could
 * drift from either.
 */
import { type Facing } from "../iso/animation";
import type { TilePoint } from "../iso/coords";
import {
  inBounds,
  propTiles,
  tileAt,
  type IsoMap,
  type PropId,
} from "../iso/tilemap";
import type { VisionSpec } from "../data/stealth";

/**
 * The one thing in the city you can see through and not walk through.
 * Everything else that blocks a body blocks a line of sight too, which
 * is why this is a list of exceptions rather than a list of walls: a
 * prop added later is cover until somebody says otherwise, and cover
 * that turns out to be glass is a smaller surprise than glass that
 * turns out to be cover.
 */
export const SEE_THROUGH_PROPS: readonly PropId[] = [
  "glass-partition-x",
  "glass-partition-y",
];

const seeThrough = new Set<PropId>(SEE_THROUGH_PROPS);

/** Forward step for a facing, and the lateral one a cone widens along. */
const AXES: Record<Facing, { fx: number; fy: number; lx: number; ly: number }> = {
  n: { fx: 0, fy: -1, lx: 1, ly: 0 },
  s: { fx: 0, fy: 1, lx: 1, ly: 0 },
  e: { fx: 1, fy: 0, lx: 0, ly: 1 },
  w: { fx: -1, fy: 0, lx: 0, ly: 1 },
};

/**
 * A map's opacity, computed once and kept with the map object. Cones
 * are re-derived every frame the scene draws one, and walking the whole
 * prop list per tile per sample line is the only part of that which
 * would ever have shown up in a profile.
 */
const sightGrids = new WeakMap<IsoMap, boolean[][]>();

function sightGrid(map: IsoMap): boolean[][] {
  const cached = sightGrids.get(map);
  if (cached) return cached;
  const grid: boolean[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < map.width; x++) {
      const tile = tileAt(map, x, y);
      row.push(!tile || !tile.walkable);
    }
    grid.push(row);
  }
  for (const prop of map.props) {
    if (!prop.blocks || seeThrough.has(prop.propId)) continue;
    for (const tile of propTiles(prop)) {
      const row = grid[tile.y];
      if (row && tile.x >= 0 && tile.x < map.width) row[tile.x] = true;
    }
  }
  sightGrids.set(map, grid);
  return grid;
}

/**
 * True if a line of sight cannot pass through this tile: off the map,
 * standing on something a body could not, or behind a blocking prop
 * that is not glass. People are deliberately not in this list — an
 * interactable is a person or a piece of kit on a tile, not a wall, and
 * hiding behind the receptionist is not a mechanic.
 */
export function blocksSight(map: IsoMap, x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return true;
  return sightGrid(map)[y]?.[x] ?? true;
}

/**
 * The tiles a cone covers on an empty grid: everything at forward depth
 * 1..range whose lateral offset is within `floor((depth - 1) * spread)`.
 *
 * That shape starts as a single tile directly ahead and opens from
 * there, which is what makes a cone readable at a glance: the tile a
 * guard is about to walk onto is always watched, and the ground beside
 * them is only watched once they are far enough away for it to be in
 * front of them. Spread 0 is a corridor's straight line; spread 1 opens
 * the full quarter.
 *
 * Returned in depth-then-lateral order, so the list is stable and two
 * identical specs always produce byte-identical output.
 */
export function coneTiles(
  origin: TilePoint,
  facing: Facing,
  spec: VisionSpec,
): TilePoint[] {
  const axis = AXES[facing];
  const range = Math.max(0, Math.trunc(spec.range));
  const spread = Math.max(0, spec.spread);
  const tiles: TilePoint[] = [];
  for (let depth = 1; depth <= range; depth++) {
    const half = Math.floor((depth - 1) * spread);
    for (let lateral = -half; lateral <= half; lateral++) {
      tiles.push({
        x: origin.x + axis.fx * depth + axis.lx * lateral,
        y: origin.y + axis.fy * depth + axis.ly * lateral,
      });
    }
  }
  return tiles;
}

/**
 * Every tile strictly between two tiles, as the sight line crosses them.
 * Sampled off the straight segment between the two tile centres at
 * half-tile steps, which on grids this size is both exact enough and
 * completely deterministic — the same pair always yields the same list.
 */
export function sightLine(from: TilePoint, to: TilePoint): TilePoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  if (steps <= 1) return [];
  const between: TilePoint[] = [];
  for (let i = 1; i < steps; i++) {
    const x = Math.round(from.x + (dx * i) / steps);
    const y = Math.round(from.y + (dy * i) / steps);
    if ((x === from.x && y === from.y) || (x === to.x && y === to.y)) continue;
    const last = between[between.length - 1];
    if (last && last.x === x && last.y === y) continue;
    between.push({ x, y });
  }
  return between;
}

/** True if nothing between the two tiles stops the line. */
export function hasLineOfSight(
  map: IsoMap,
  from: TilePoint,
  to: TilePoint,
): boolean {
  return !sightLine(from, to).some((tile) => blocksSight(map, tile.x, tile.y));
}

/**
 * What one pair of eyes actually holds this instant: the cone, minus
 * everything off the map, minus everything a wall is standing in front
 * of. The tile the guard is on is never in it — you are not seen by
 * being underneath somebody, you are seen by being in front of them.
 */
export function visionTiles(
  map: IsoMap,
  origin: TilePoint,
  facing: Facing,
  spec: VisionSpec,
): TilePoint[] {
  return coneTiles(origin, facing, spec).filter(
    (tile) =>
      inBounds(map, tile.x, tile.y) &&
      !blocksSight(map, tile.x, tile.y) &&
      hasLineOfSight(map, origin, tile),
  );
}

/**
 * The tiles a guard *hears* rather than sees: their own, and the four
 * around it. Ordinary walking carries that far; crouching does not
 * carry at all (see src/stealth/detect.ts), which is the whole of the
 * noise model and the whole of what the crouch key buys.
 */
export function earshotTiles(origin: TilePoint): TilePoint[] {
  return [
    { x: origin.x, y: origin.y },
    { x: origin.x + 1, y: origin.y },
    { x: origin.x - 1, y: origin.y },
    { x: origin.x, y: origin.y + 1 },
    { x: origin.x, y: origin.y - 1 },
  ];
}
