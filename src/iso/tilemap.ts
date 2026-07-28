/**
 * Typed tilemap model for isometric maps: a grid of tile ids plus prop,
 * interactable, and spawn placements. Map content lives in src/data;
 * this module owns the shapes and pure queries (bounds, walkability).
 */
import type { TilePoint } from "./coords";
import type { MapInteraction } from "./events";

export type TileId =
  | "pavement"
  | "pavement-cracked"
  | "plaza-glow"
  | "road"
  | "canal"
  | "canal-deep"
  | "quay-n"
  | "quay-e"
  | "quay-s"
  | "quay-w"
  | "foundation"
  | "rust-floor";

export interface TileDef {
  id: TileId;
  walkable: boolean;
}

export const TILE_DEFS: Record<TileId, TileDef> = {
  pavement: { id: "pavement", walkable: true },
  "pavement-cracked": { id: "pavement-cracked", walkable: true },
  "plaza-glow": { id: "plaza-glow", walkable: true },
  road: { id: "road", walkable: true },
  canal: { id: "canal", walkable: false },
  "canal-deep": { id: "canal-deep", walkable: false },
  "quay-n": { id: "quay-n", walkable: true },
  "quay-e": { id: "quay-e", walkable: true },
  "quay-s": { id: "quay-s", walkable: true },
  "quay-w": { id: "quay-w", walkable: true },
  foundation: { id: "foundation", walkable: false },
  "rust-floor": { id: "rust-floor", walkable: true },
};

export type PropId =
  | "building"
  | "streetlight"
  | "crate"
  | "barrier"
  | "holo-sign"
  | "vent-stack";

/** A static decoration on a tile. Blocking props make the tile unwalkable. */
export interface PropPlacement {
  propId: PropId;
  x: number;
  y: number;
  blocks: boolean;
}

export type InteractableSpriteId = "npc" | "door" | "terminal";

/**
 * An NPC/object the player can interact with from an adjacent tile.
 * Interactables occupy (and block) their tile; the interaction payload
 * is emitted as-is by the scene — the iso layer never interprets it.
 */
export interface Interactable {
  id: string;
  x: number;
  y: number;
  label: string;
  spriteId: InteractableSpriteId;
  interaction: MapInteraction;
}

export interface SpawnPoint {
  id: string;
  x: number;
  y: number;
}

export interface IsoMap {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Row-major grid: tiles[y][x]. */
  tiles: TileId[][];
  props: PropPlacement[];
  interactables: Interactable[];
  spawns: SpawnPoint[];
}

/** A legend entry for authoring maps as compact character rows. */
export interface LegendEntry {
  tile: TileId;
  prop?: { propId: PropId; blocks: boolean };
}

/**
 * Expand character rows + legend into a tile grid and prop list. Throws
 * on ragged rows or characters missing from the legend so bad map data
 * fails fast at load time.
 */
export function buildMapGrid(
  legend: Record<string, LegendEntry>,
  rows: readonly string[],
): { tiles: TileId[][]; props: PropPlacement[]; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles: TileId[][] = [];
  const props: PropPlacement[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Map row ${y} has length ${row.length}, expected ${width}`);
    }
    const tileRow: TileId[] = [];
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? "";
      const entry = legend[ch];
      if (!entry) {
        throw new Error(`Map character "${ch}" at (${x}, ${y}) is not in the legend`);
      }
      tileRow.push(entry.tile);
      if (entry.prop) {
        props.push({ propId: entry.prop.propId, x, y, blocks: entry.prop.blocks });
      }
    }
    tiles.push(tileRow);
  });
  return { tiles, props, width, height };
}

export function inBounds(map: IsoMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function tileAt(map: IsoMap, x: number, y: number): TileDef | undefined {
  const id = map.tiles[y]?.[x];
  return id === undefined ? undefined : TILE_DEFS[id];
}

export function interactableAt(
  map: IsoMap,
  x: number,
  y: number,
): Interactable | undefined {
  return map.interactables.find((i) => i.x === x && i.y === y);
}

export function spawnPoint(map: IsoMap, id: string): SpawnPoint | undefined {
  return map.spawns.find((s) => s.id === id);
}

export function requireSpawn(map: IsoMap, id: string): SpawnPoint {
  const spawn = spawnPoint(map, id);
  if (!spawn) {
    throw new Error(`Map "${map.id}" has no spawn point "${id}"`);
  }
  return spawn;
}

/**
 * True if the tile can be stood on: in bounds, a walkable tile kind, no
 * blocking prop, and no interactable occupying it.
 */
export function isWalkable(map: IsoMap, x: number, y: number): boolean {
  const tile = tileAt(map, x, y);
  if (!tile || !tile.walkable) return false;
  if (map.props.some((p) => p.blocks && p.x === x && p.y === y)) return false;
  if (interactableAt(map, x, y)) return false;
  return true;
}

/** The 4-neighborhood of a tile, unfiltered. */
export function neighbors(p: TilePoint): TilePoint[] {
  return [
    { x: p.x + 1, y: p.y },
    { x: p.x - 1, y: p.y },
    { x: p.x, y: p.y + 1 },
    { x: p.x, y: p.y - 1 },
  ];
}
