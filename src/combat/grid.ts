import type { Combatant, GridPosition, GridSize } from "./types";
import { isAlive } from "./state";

/**
 * Grid rules. Arenas are small orthogonal grids (matching future iso
 * combat maps); all distance is Manhattan — diagonal steps do not exist.
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
    (c) =>
      c.id !== ignoreId &&
      isAlive(c) &&
      c.position.x === position.x &&
      c.position.y === position.y,
  );
}

/** Grid steps per turn, derived from Reflexes. */
export function moveSpeed(reflexes: number): number {
  return 2 + Math.floor(reflexes / 4);
}
