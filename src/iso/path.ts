/**
 * Pure BFS pathfinding over walkable tiles. Movement is 4-directional
 * with uniform cost, so BFS yields shortest paths; maps are small enough
 * that no heuristic is needed.
 */
import { sameTile, tileDistance, type TilePoint } from "./coords";
import { isWalkable, neighbors, type IsoMap } from "./tilemap";

const keyOf = (p: TilePoint): string => `${p.x},${p.y}`;

/**
 * Shortest path from start to goal over walkable tiles, inclusive of
 * both endpoints. The start tile itself need not be walkable (the player
 * is already standing there). Returns null when the goal is unreachable
 * or not walkable; returns [start] when start equals goal.
 */
export function findPath(
  map: IsoMap,
  start: TilePoint,
  goal: TilePoint,
): TilePoint[] | null {
  if (sameTile(start, goal)) return [start];
  if (!isWalkable(map, goal.x, goal.y)) return null;

  const cameFrom = new Map<string, TilePoint>();
  const visited = new Set<string>([keyOf(start)]);
  const queue: TilePoint[] = [start];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    if (!current) break;
    for (const next of neighbors(current)) {
      const key = keyOf(next);
      if (visited.has(key) || !isWalkable(map, next.x, next.y)) continue;
      visited.add(key);
      cameFrom.set(key, current);
      if (sameTile(next, goal)) {
        const path: TilePoint[] = [next];
        let step: TilePoint | undefined = current;
        while (step) {
          path.push(step);
          step = cameFrom.get(keyOf(step));
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Shortest path ending on a walkable tile adjacent to target (used for
 * walking up to interactables, which block their own tile). Returns
 * [start] when the player is already adjacent, null when no adjacent
 * tile is reachable.
 */
export function findPathToAdjacent(
  map: IsoMap,
  start: TilePoint,
  target: TilePoint,
): TilePoint[] | null {
  if (tileDistance(start, target) === 1) return [start];
  let best: TilePoint[] | null = null;
  for (const side of neighbors(target)) {
    const path = findPath(map, start, side);
    if (path && (!best || path.length < best.length)) {
      best = path;
    }
  }
  return best;
}
