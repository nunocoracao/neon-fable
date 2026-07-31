import type { Combatant, GridPosition, GridSize } from "./types";
import {
  bodyCovers,
  footprintFits,
  footprintsOverlap,
} from "./footprint";
import { isAlive } from "./state";

/**
 * Grid rules. Arenas are small orthogonal grids (matching the iso combat
 * maps); all distance is Manhattan — diagonal steps do not exist.
 *
 * Occupancy is asked of *blocks*, not points: every combatant stands on
 * a footprint (see ./footprint.ts), which is one tile for almost
 * everything and 2×2 for a security chassis. `manhattan` still measures
 * two points, because a step still costs the distance between anchors;
 * reach between two bodies is `bodyGap`, which measures block to block.
 */

export function manhattan(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(grid: GridSize, position: GridPosition): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.x < grid.width &&
    position.y >= 0 &&
    position.y < grid.height
  );
}

/** True when a living combatant (other than ignoreId) stands on the tile. */
export function isOccupied(
  combatants: Combatant[],
  position: GridPosition,
  ignoreId?: string,
): boolean {
  return combatants.some(
    (c) => c.id !== ignoreId && isAlive(c) && bodyCovers(c, position),
  );
}

/**
 * True when any living combatant (other than ignoreId) is standing on
 * *any* tile of the block. The check a move makes: a 2×2 body cannot
 * step onto a tile whose neighbours are taken, however free its own
 * anchor tile is.
 */
export function isBlocked(
  combatants: Combatant[],
  anchor: GridPosition,
  footprint: GridSize | undefined,
  ignoreId?: string,
): boolean {
  return combatants.some(
    (c) =>
      c.id !== ignoreId &&
      isAlive(c) &&
      footprintsOverlap(anchor, footprint, c.position, c.footprint),
  );
}

/**
 * Whether a body of this size could stand anchored here: the whole block
 * on the grid, and nobody else already on any of it.
 */
export function canStand(
  grid: GridSize,
  combatants: Combatant[],
  anchor: GridPosition,
  footprint: GridSize | undefined,
  ignoreId?: string,
): boolean {
  return (
    footprintFits(grid, anchor, footprint) &&
    !isBlocked(combatants, anchor, footprint, ignoreId)
  );
}

/** The living combatant standing on a tile, or undefined. */
export function combatantAt(
  combatants: readonly Combatant[],
  tile: GridPosition,
): Combatant | undefined {
  return combatants.find((c) => isAlive(c) && bodyCovers(c, tile));
}

/** Grid steps per turn, derived from Reflexes. */
export function moveSpeed(reflexes: number): number {
  return 2 + Math.floor(reflexes / 4);
}
