/**
 * Shared fixtures and the solvability search the stealth tests lean on.
 * No vitest imports here, so it type-checks as ordinary source (the
 * same rule src/combat/testSupport.ts follows).
 */
import type { StealthZone } from "../data/stealth";
import type { TilePoint } from "../iso/coords";
import {
  buildMapGrid,
  isWalkable,
  neighbors,
  type IsoMap,
  type LegendEntry,
} from "../iso/tilemap";
import type { FlagMap } from "../state/flags";
import { detectAt } from "./detect";
import { patrolCycleLength } from "./patrol";
import { guardViews } from "./watch";

/**
 * A room to be watched in: 9 by 7, open floor inside a wall, with the
 * bottom row of floor (y = 5) outside the zone's bounds so it can serve
 * as the far side of the crossing.
 *
 *      012345678
 *   0  #########
 *   1  #.......#
 *   2  #.......#
 *   3  #.......#
 *   4  #.......#
 *   5  #.......#   <- outside the bounds: the far side
 *   6  #########
 */
const roomLegend: Record<string, LegendEntry> = {
  "#": { tile: "foundation" },
  ".": { tile: "pavement" },
};

const roomRows = [
  "#########",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#.......#",
  "#########",
];

export function testRoom(): IsoMap {
  const grid = buildMapGrid(roomLegend, roomRows);
  return {
    id: "stealth-test-room",
    name: "Test Room",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles,
    props: grid.props,
    interactables: [],
    spawns: [{ id: "player-start", x: 4, y: 1 }],
  };
}

/**
 * A zone over that room: one guard who can be taken down walking the
 * middle of it, one who cannot standing east of them, a pinch at the
 * mouth of the far side, and the far side itself as the goal.
 *
 * The encounter is a real one (its slots are what a takedown writes
 * against), which is also what keeps this fixture honest about the join
 * between a zone and the fight it is an alternative to.
 */
export function testZone(overrides: Partial<StealthZone> = {}): StealthZone {
  return {
    id: "test-zone",
    name: "The Test Watch",
    mapId: "stealth-test-room",
    encounterId: "enc-auric-scout",
    bounds: { x: 1, y: 1, width: 7, height: 4 },
    guards: [
      {
        id: "walker",
        name: "the walker",
        enemyId: "nme-auric-agent",
        spawnSlot: 0,
        route: {
          waypoints: [
            { x: 3, y: 1, dwell: 1, facing: "s" },
            { x: 3, y: 4, dwell: 1, facing: "n" },
          ],
          loop: "pingpong",
        },
        vision: { range: 3, spread: 0 },
        bark: "\"Hey!\"",
      },
      {
        id: "machine",
        name: "the machine",
        enemyId: "nme-static-drone",
        spawnSlot: 1,
        takedown: false,
        route: { waypoints: [{ x: 6, y: 2, facing: "w" }] },
        vision: { range: 2, spread: 0 },
        bark: "The lamp stops on you.",
      },
    ],
    pinches: [
      {
        id: "mouth",
        label: "the mouth of the far side",
        from: { x: 1, y: 3 },
        to: { x: 1, y: 5 },
        reflexes: 6,
      },
    ],
    goal: { tiles: [{ x: 1, y: 5 }], nodeId: "test-passed" },
    spottedNodeId: "test-spotted",
    ...overrides,
  };
}

/** Least common multiple of every live guard's own cycle. */
export function watchPeriod(zone: StealthZone, flags: FlagMap = {}): number {
  const lengths = zone.guards
    .filter(
      (guard) =>
        guard.absentWhenFlag === undefined || flags[guard.absentWhenFlag] !== true,
    )
    .map((guard) => patrolCycleLength(guard.route));
  return lengths.reduce(lcm, 1);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/**
 * A crossing that actually works, or null if there is not one.
 *
 * Breadth-first over (tile, tick modulo the watch's period), because
 * the watch is periodic and a player standing still is a legal move —
 * so waiting for a cone to sweep past is a step in the search exactly
 * as it is a decision at the keyboard. One tile per tick is the
 * conservative reading of the player's own pace: crouch-walking covers
 * a tile in about six tenths of a tick, so anything this finds is
 * something a player can do, and slower.
 *
 * Crouched throughout, which is the whole point: sound is the part the
 * player controls, so what this proves is that the *cones* leave a way
 * through.
 */
export function sneakRoute(
  map: IsoMap,
  zone: StealthZone,
  start: TilePoint,
  flags: FlagMap = {},
): TilePoint[] | null {
  const period = watchPeriod(zone, flags);
  const seenAt = (tile: TilePoint, tick: number): boolean =>
    detectAt(zone, guardViews(map, zone, tick, flags), tile, {
      crouched: true,
    }) !== null;
  if (seenAt(start, 0)) return null;

  const key = (tile: TilePoint, phase: number): string =>
    `${tile.x},${tile.y}@${phase}`;
  const cameFrom = new Map<string, string | null>([[key(start, 0), null]]);
  const tileOf = new Map<string, { tile: TilePoint; tick: number }>([
    [key(start, 0), { tile: start, tick: 0 }],
  ]);
  const queue: string[] = [key(start, 0)];

  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    const here = tileOf.get(current)!;
    if (zone.goal.tiles.some((t) => t.x === here.tile.x && t.y === here.tile.y)) {
      const path: TilePoint[] = [];
      let step: string | null | undefined = current;
      while (step) {
        path.push(tileOf.get(step)!.tile);
        step = cameFrom.get(step);
      }
      return path.reverse();
    }
    const tick = here.tick + 1;
    const moves: TilePoint[] = [
      here.tile,
      ...neighbors(here.tile).filter((tile) => isWalkable(map, tile.x, tile.y)),
    ];
    for (const move of moves) {
      const next = key(move, tick % period);
      if (cameFrom.has(next)) continue;
      if (seenAt(move, tick)) continue;
      cameFrom.set(next, current);
      tileOf.set(next, { tile: move, tick });
      queue.push(next);
    }
  }
  return null;
}
