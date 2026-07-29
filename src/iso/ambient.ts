/**
 * Ambient pedestrians: seeded street crowds that make explorable maps
 * feel inhabited. Everything here is pure and deterministic — spawn
 * placement, target choice, and per-frame stepping all run off state
 * the caller passes in, with each pedestrian carrying its own RngState
 * (never Math.random), so a crowd replays identically and is testable
 * without a canvas.
 *
 * Pedestrians are scenery, deliberately:
 * - They are not interactables, so they can never be clicked, talked
 *   to, or fought — the scene's picking only ever consults map data.
 * - They stay inside their declared zone, transit included: the route
 *   is pathfound with the zone as a tile filter, so a market-corner
 *   local never takes a shortcut across the plaza to get home.
 * - They carry no collision at all. The player walks straight through
 *   them and so do they through each other; walking around a wandering
 *   figure that has already moved on feels worse than passing it, and
 *   "no collision" is the rule with no failure modes (no deadlocks, no
 *   pedestrian boxing the player into a corner).
 * - They never stop on a story NPC's approach tile: the tiles adjacent
 *   to an interactable are excluded from spawn and target picks, so a
 *   passerby can drift past a quest-giver but never park in front of
 *   one. (Trigger tiles stay walkable — the crowd just doesn't loiter.)
 * - They never enter combat. Fights run on arena maps in their own
 *   scene, and arenas declare no ambient spec; a crowd cannot outlive
 *   the exploration scene that spawned it.
 */
import { facingFromDelta, type Facing } from "./animation";
import type { TilePoint, WorldPoint } from "./coords";
import { findPath } from "./path";
import type { SceneEntity } from "./render";
import { isWalkable, neighbors, type AmbientZone, type IsoMap } from "./tilemap";
import { createRng, hashSeed, nextFloat, nextInt, type RngState } from "../state/rng";

/**
 * Hard cap on concurrent pedestrians per map, whatever the data asks
 * for. Each pedestrian costs a depth-sorted draw plus a BFS every few
 * seconds; a dozen keeps the busiest street lively while leaving the
 * frame budget untouched.
 */
export const MAX_AMBIENT_PER_MAP = 12;

/** Seconds a pedestrian dwells between strolls. */
const IDLE_MIN_S = 0.8;
const IDLE_MAX_S = 3.2;

/** Tiles per second, drawn per pedestrian so gaits vary in a crowd. */
const SPEED_MIN = 1.3;
const SPEED_MAX = 2.2;

/** A single wandering figure. Plain data — every field is serializable. */
export interface AmbientPedestrian {
  id: string;
  /** Stable seed for this pedestrian's look (see seededAppearance). */
  lookSeed: number;
  /** Zone the pedestrian keeps to; it only ever targets tiles inside. */
  zoneId: string;
  /** Tile currently stood on, or being walked out of mid-step. */
  tile: TilePoint;
  /** Draw position; fractional while walking between tiles. */
  position: WorldPoint;
  facing: Facing;
  /** Remaining steps; [0] is the tile being entered. Empty while idle. */
  path: readonly TilePoint[];
  /** 0..1 progress from tile toward path[0]. */
  progress: number;
  /** Seconds left to dwell before picking a new target. */
  idleFor: number;
  /** Walk speed in tiles per second. */
  speed: number;
  rng: RngState;
}

/**
 * A zone as the crowd logic uses it: the authored rectangle plus the
 * tiles inside it a pedestrian may stop on, resolved once at spawn (map
 * geometry never changes mid-scene) so stepping costs no grid scans.
 */
export interface AmbientZoneState {
  zone: AmbientZone;
  tiles: readonly TilePoint[];
}

/** A map's live crowd: its pedestrians and the zones they belong to. */
export interface AmbientCrowd {
  pedestrians: readonly AmbientPedestrian[];
  zones: ReadonlyMap<string, AmbientZoneState>;
}

/** True if a tile falls inside a zone's rectangle. */
export function inZone(zone: AmbientZone, x: number, y: number): boolean {
  return (
    x >= zone.x &&
    y >= zone.y &&
    x < zone.x + zone.width &&
    y < zone.y + zone.height
  );
}

/** Sprite id a pedestrian's look resolves through in the provider. */
export function ambientSpriteId(lookSeed: number): string {
  return `ambient:${lookSeed >>> 0}`;
}

/**
 * The look seed inside an ambient sprite id, or null for any other
 * entity id (the player, enemy archetypes). Lets one entity-descriptor
 * source serve both without the provider knowing about crowds.
 */
export function ambientLookSeed(spriteId: string): number | null {
  if (!spriteId.startsWith("ambient:")) return null;
  const seed = Number(spriteId.slice("ambient:".length));
  return Number.isInteger(seed) && seed >= 0 ? seed : null;
}

/** True if a tile is adjacent to an interactable's trigger position. */
function nearInteractable(map: IsoMap, tile: TilePoint): boolean {
  return neighbors(tile).some((n) =>
    map.interactables.some((i) => i.x === n.x && i.y === n.y),
  );
}

/**
 * Tiles inside a zone a pedestrian may stand on: walkable, and clear of
 * every story interactable's approach ring. Returned in row-major order
 * so the list is stable for a given map.
 */
export function roamTiles(map: IsoMap, zone: AmbientZone): TilePoint[] {
  const tiles: TilePoint[] = [];
  for (let y = zone.y; y < zone.y + zone.height; y++) {
    for (let x = zone.x; x < zone.x + zone.width; x++) {
      const tile = { x, y };
      if (!isWalkable(map, x, y)) continue;
      if (nearInteractable(map, tile)) continue;
      tiles.push(tile);
    }
  }
  return tiles;
}

/** Every zone the map declares, resolved to its roamable tiles. */
export function resolveZones(map: IsoMap): Map<string, AmbientZoneState> {
  const zones = new Map<string, AmbientZoneState>();
  for (const zone of map.ambient?.zones ?? []) {
    zones.set(zone.id, { zone, tiles: roamTiles(map, zone) });
  }
  return zones;
}

const sameTileAs = (a: TilePoint, b: TilePoint): boolean =>
  a.x === b.x && a.y === b.y;

/**
 * Spawn a map's crowd. Pedestrians are dealt across the declared zones
 * round-robin, each on a free roamable tile of its zone, and each seeded
 * from the map id and its index — so the same map always produces the
 * same people standing in the same places, session after session.
 * Maps without an ambient spec (arenas, quiet interiors) get an empty
 * crowd; the count is clamped to MAX_AMBIENT_PER_MAP.
 */
export function createCrowd(map: IsoMap): AmbientCrowd {
  const zones = resolveZones(map);
  const order = map.ambient?.zones ?? [];
  const count = Math.min(
    Math.max(0, Math.floor(map.ambient?.count ?? 0)),
    MAX_AMBIENT_PER_MAP,
  );
  if (order.length === 0 || count === 0) return { pedestrians: [], zones };

  const pedestrians: AmbientPedestrian[] = [];
  const taken: TilePoint[] = [];
  for (let i = 0; i < count; i++) {
    const zone = order[i % order.length];
    if (!zone) continue;
    const free = (zones.get(zone.id)?.tiles ?? []).filter(
      (tile) => !taken.some((t) => sameTileAs(t, tile)),
    );
    // A zone with nowhere left to stand simply seats fewer people
    // rather than stacking them — a crowd is data-tuned, not enforced.
    if (free.length === 0) continue;

    let rng: RngState = createRng(hashSeed(`${map.id}:ambient:${i}`));
    const place = nextInt(rng, 0, free.length - 1);
    rng = place.state;
    const tile = free[place.value] ?? free[0];
    if (!tile) continue;
    taken.push(tile);

    const gait = nextFloat(rng);
    rng = gait.state;
    const dwell = nextFloat(rng);
    rng = dwell.state;

    pedestrians.push({
      id: `${map.id}:ped:${i}`,
      lookSeed: hashSeed(`${map.id}:ambient-look:${i}`),
      zoneId: zone.id,
      tile,
      position: { x: tile.x, y: tile.y },
      facing: "s",
      path: [],
      progress: 0,
      // Staggered first dwell so a crowd doesn't step off in lockstep.
      idleFor: dwell.value * IDLE_MAX_S,
      speed: SPEED_MIN + gait.value * (SPEED_MAX - SPEED_MIN),
      rng,
    });
  }
  return { pedestrians, zones };
}

/** Dwell a beat, drawing the duration from the pedestrian's own RNG. */
function rest(ped: AmbientPedestrian, rng: RngState): AmbientPedestrian {
  const dwell = nextFloat(rng);
  return {
    ...ped,
    path: [],
    progress: 0,
    position: { x: ped.tile.x, y: ped.tile.y },
    idleFor: IDLE_MIN_S + dwell.value * (IDLE_MAX_S - IDLE_MIN_S),
    rng: dwell.state,
  };
}

/**
 * Pick a reachable tile in the pedestrian's zone and route to it with
 * the scene's own pathfinder, restricted to the zone so the walk itself
 * stays where it belongs. An unreachable pick just costs another beat
 * of dwelling — no retry loop, so the work per wake-up is one BFS.
 */
function chooseTarget(
  ped: AmbientPedestrian,
  map: IsoMap,
  zones: ReadonlyMap<string, AmbientZoneState>,
): AmbientPedestrian {
  const state = zones.get(ped.zoneId);
  const tiles = state?.tiles ?? [];
  if (!state || tiles.length === 0) return rest(ped, ped.rng);

  const pick = nextInt(ped.rng, 0, tiles.length - 1);
  const target = tiles[pick.value];
  const path = target
    ? findPath(map, ped.tile, target, (x, y) => inZone(state.zone, x, y))
    : null;
  const steps = path ? path.slice(1) : [];
  const next = steps[0];
  if (!next) return rest(ped, pick.state);

  return {
    ...ped,
    path: steps,
    progress: 0,
    idleFor: 0,
    facing: facingFromDelta(next.x - ped.tile.x, next.y - ped.tile.y) ?? ped.facing,
    rng: pick.state,
  };
}

/**
 * Advance one pedestrian by dt seconds: burn down the dwell timer, pick
 * a new stroll when it runs out, or walk the current path one step at a
 * time (mirroring the player's own tile-by-tile interpolation, so a
 * crowd and the player read as moving on the same grid).
 */
export function stepPedestrian(
  ped: AmbientPedestrian,
  map: IsoMap,
  zones: ReadonlyMap<string, AmbientZoneState>,
  dt: number,
): AmbientPedestrian {
  if (dt <= 0) return ped;

  if (ped.path.length === 0) {
    const idleFor = ped.idleFor - dt;
    if (idleFor > 0) return { ...ped, idleFor };
    return chooseTarget(ped, map, zones);
  }

  let progress = ped.progress + ped.speed * dt;
  let tile = ped.tile;
  let path = ped.path;
  while (progress >= 1 && path.length > 0) {
    progress -= 1;
    tile = path[0] ?? tile;
    path = path.slice(1);
  }

  const next = path[0];
  if (!next) return rest({ ...ped, tile }, ped.rng);

  return {
    ...ped,
    tile,
    path,
    progress,
    facing: facingFromDelta(next.x - tile.x, next.y - tile.y) ?? ped.facing,
    position: {
      x: tile.x + (next.x - tile.x) * progress,
      y: tile.y + (next.y - tile.y) * progress,
    },
  };
}

/**
 * Advance a whole crowd. Pedestrians never read each other's state, so
 * the result does not depend on update order — the crowd is a bag of
 * independent seeded walks, which is what keeps it replayable.
 */
export function stepCrowd(
  crowd: AmbientCrowd,
  map: IsoMap,
  dt: number,
): AmbientCrowd {
  if (dt <= 0 || crowd.pedestrians.length === 0) return crowd;
  return {
    zones: crowd.zones,
    pedestrians: crowd.pedestrians.map((ped) =>
      stepPedestrian(ped, map, crowd.zones, dt),
    ),
  };
}

/**
 * The crowd as renderable entities. They join the scene's single
 * painter's-order pass alongside the player, props, and interactables,
 * so a pedestrian crossing in front of a streetlight or behind the
 * player sorts correctly with no crowd-specific depth handling.
 */
export function crowdEntities(crowd: AmbientCrowd): SceneEntity[] {
  return crowd.pedestrians.map((ped) => ({
    spriteId: ambientSpriteId(ped.lookSeed),
    position: ped.position,
    facing: ped.facing,
    moving: ped.path.length > 0,
  }));
}
