/**
 * Pure projection math for the exploration minimap: how a map's tiles
 * read as two-tone cells, where each tile lands in minimap pixels, the
 * pips that ride on top, and the rectangle marking what the camera
 * currently frames. The canvas side (src/ui/minimap.ts) only fills
 * rectangles where this module says to, so every position here is
 * testable without a canvas.
 *
 * Fog-free, by decision: no map in the game is larger than ~16x13 tiles
 * and every one is fully reachable from its spawn (pinned by the map
 * lint in src/data/maps.test.ts), so a fog-of-war layer would buy no
 * navigational tension while costing per-map explored state in every
 * save file. The minimap always shows the whole map.
 *
 * The camera's visible area is a diamond in tile space — the scene is
 * isometric, the minimap is top-down — so the viewport marker is that
 * diamond's bounding box rather than its outline. At ~8 px per tile an
 * outlined diamond is a jagged smear; the box reads instantly as "you
 * are looking at roughly this part of the map", which is the whole job.
 */
import type { Facing } from "./animation";
import { viewportToWorld, type Camera } from "./camera";
import { screenToWorld, type TilePoint } from "./coords";
import {
  TILE_DEFS,
  tileMaterial,
  type Interactable,
  type InteractableSpriteId,
  type IsoMap,
} from "./tilemap";

/** Longest edge of the minimap, in CSS pixels, before cells shrink. */
export const MINIMAP_MAX_PX = 132;
/** Cell size floor and ceiling, in CSS pixels. Integers keep it crisp. */
export const MINIMAP_CELL_MIN = 3;
export const MINIMAP_CELL_MAX = 10;

/**
 * How a tile reads at minimap scale. Two tones carry walkability;
 * water and void are tinted apart because they are the two things a
 * player reads as "not a route" at a glance — open water, and the
 * building footprints that have no ground at all.
 */
export type MinimapCell = "void" | "water" | "blocked" | "walkable";

/** A pip riding on top of the cell grid. */
export type MinimapPipKind = "player" | "exit" | "npc" | "objective";

/**
 * Minimap ink, mirroring the HUD palette in src/ui/theme.css. Held as
 * values rather than CSS custom properties so the painter never has to
 * resolve styles mid-redraw.
 */
export const MINIMAP_COLORS: Readonly<
  Record<MinimapCell | MinimapPipKind | "viewport" | "frame", string>
> = {
  void: "#05060c",
  blocked: "#1b1b2f",
  walkable: "#3c3c60",
  water: "#1a4b55",
  frame: "#2a2a44",
  viewport: "rgba(46, 230, 214, 0.55)",
  player: "#e8e6f0",
  exit: "#f0b429",
  npc: "#2ee6d6",
  objective: "#e63e8f",
};

/** Minimap-space step per facing; the minimap is plain top-down tiles. */
export const FACING_STEP: Readonly<Record<Facing, { x: number; y: number }>> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

export interface MinimapLayout {
  /** CSS pixels per tile on both axes. Always a whole number. */
  cell: number;
  /** Overall size in CSS pixels. */
  width: number;
  height: number;
}

/**
 * Fit a map into MINIMAP_MAX_PX at a whole number of pixels per tile,
 * so no cell can be sliced fractionally and the grid stays hard-edged
 * at any device pixel ratio.
 */
export function minimapLayout(
  map: Pick<IsoMap, "width" | "height">,
  maxPx: number = MINIMAP_MAX_PX,
): MinimapLayout {
  const span = Math.max(1, map.width, map.height);
  const cell = Math.min(
    MINIMAP_CELL_MAX,
    Math.max(MINIMAP_CELL_MIN, Math.floor(maxPx / span)),
  );
  return {
    cell,
    width: cell * Math.max(0, map.width),
    height: cell * Math.max(0, map.height),
  };
}

/** Top-left corner of a tile's cell, in minimap pixels. */
export function tileTopLeft(
  layout: MinimapLayout,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: x * layout.cell, y: y * layout.cell };
}

/** Center of a tile's cell, in minimap pixels. */
export function tileCenter(
  layout: MinimapLayout,
  x: number,
  y: number,
): { x: number; y: number } {
  return { x: (x + 0.5) * layout.cell, y: (y + 0.5) * layout.cell };
}

/** Side of a pip's square, in minimap pixels. */
export function pipSize(layout: MinimapLayout): number {
  return Math.max(2, Math.min(4, Math.round(layout.cell * 0.6)));
}

/** How far the player's facing tick reaches past the pip's center. */
export function tickLength(layout: MinimapLayout): number {
  return Math.max(2, Math.round(layout.cell * 0.5));
}

/**
 * How a single tile reads. Interactables are deliberately ignored: an
 * NPC or a terminal standing on open ground is an occupant, not
 * geometry, and it gets a pip of its own — punching a blocked cell
 * under every one of them would read as walls that are not there.
 */
export function minimapCell(map: IsoMap, x: number, y: number): MinimapCell {
  const tile = map.tiles[y]?.[x];
  if (tile === undefined) return "void";
  const material = tileMaterial(tile);
  // Building footprints: not impassable ground, no ground at all.
  if (material === "foundation") return "void";
  if (material === "water") return "water";
  if (!TILE_DEFS[tile].walkable) return "blocked";
  const blocked = map.props.some((p) => p.blocks && p.x === x && p.y === y);
  return blocked ? "blocked" : "walkable";
}

/** The whole cell grid, row-major like map.tiles, for one paint pass. */
export function minimapCells(map: IsoMap): MinimapCell[][] {
  const rows: MinimapCell[][] = [];
  for (let y = 0; y < map.height; y++) {
    const row: MinimapCell[] = [];
    for (let x = 0; x < map.width; x++) row.push(minimapCell(map, x, y));
    rows.push(row);
  }
  return rows;
}

/** Object kinds that count as quest-relevant without being flagged. */
const KEY_SPRITE_IDS: ReadonlySet<InteractableSpriteId> = new Set([
  "terminal",
  "stash",
]);

/**
 * Which pip an interactable earns, or null for none. Ways out and
 * people always show — they are what navigating a district is about.
 * Objects are quest-relevant by declaration: the key kinds (terminals
 * and stashes, the things a job sends you to) default on, anything else
 * needs `minimap: true` in map data, and `minimap: false` takes any of
 * them back off when a corner of a map would otherwise crowd.
 */
export function minimapPipKind(
  interactable: Interactable,
): Exclude<MinimapPipKind, "player"> | null {
  if (interactable.minimap === false) return null;
  if (interactable.exit) return "exit";
  if (interactable.spriteId === "npc") return "npc";
  if (interactable.minimap === true || KEY_SPRITE_IDS.has(interactable.spriteId)) {
    return "objective";
  }
  return null;
}

export interface MinimapPip {
  kind: MinimapPipKind;
  /** The interactable's id; absent on the player's own pip. */
  id?: string;
  /** Center of the pip, in minimap pixels. */
  x: number;
  y: number;
  /** Side of the square to fill, in minimap pixels. */
  size: number;
  /**
   * Where the facing tick ends, in minimap pixels — a short line out of
   * the pip's center. Only the player carries one.
   */
  tick?: { x: number; y: number };
}

export interface MinimapPlayer {
  tile: TilePoint;
  facing: Facing;
}

/**
 * Every pip to draw, in paint order. The player goes last so that on a
 * crowded tile the pip you steer by is the one left visible.
 */
export function minimapPips(
  map: IsoMap,
  layout: MinimapLayout,
  player: MinimapPlayer,
): MinimapPip[] {
  const size = pipSize(layout);
  const pips: MinimapPip[] = [];
  for (const interactable of map.interactables) {
    const kind = minimapPipKind(interactable);
    if (!kind) continue;
    const center = tileCenter(layout, interactable.x, interactable.y);
    pips.push({ kind, id: interactable.id, x: center.x, y: center.y, size });
  }
  const center = tileCenter(layout, player.tile.x, player.tile.y);
  const step = FACING_STEP[player.facing];
  const reach = size / 2 + tickLength(layout);
  pips.push({
    kind: "player",
    x: center.x,
    y: center.y,
    size,
    tick: { x: center.x + step.x * reach, y: center.y + step.y * reach },
  });
  return pips;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface MinimapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * What the camera frames, as a rectangle in minimap pixels clipped to
 * the map (see the module note on why a box and not a diamond). A
 * viewport that has not been measured yet yields an empty rect, which
 * the painter skips.
 */
export function minimapViewport(
  layout: MinimapLayout,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  zoom: number,
): MinimapRect {
  if (viewportW <= 0 || viewportH <= 0 || zoom <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const cssCorners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [viewportW, 0],
    [0, viewportH],
    [viewportW, viewportH],
  ];
  const corners = cssCorners.map(([cssX, cssY]) => {
    const screen = viewportToWorld(camera, viewportW, viewportH, zoom, cssX, cssY);
    return screenToWorld(screen.sx, screen.sy);
  });
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  // A tile's center sits at (tile + 0.5) * cell, so a fractional world
  // coordinate maps the same way. Both edges are clipped to the overview,
  // so a camera panned off the map leaves an empty rect inside it rather
  // than a stray origin outside it.
  const px = (tile: number): number => (tile + 0.5) * layout.cell;
  const left = clamp(px(Math.min(...xs)), 0, layout.width);
  const right = clamp(px(Math.max(...xs)), 0, layout.width);
  const top = clamp(px(Math.min(...ys)), 0, layout.height);
  const bottom = clamp(px(Math.max(...ys)), 0, layout.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * What painting the minimap needs from the live scene: where the player
 * stands and looks, and what the camera frames. The scene reports it as
 * it changes; the widget diffs it with sameMinimapView and repaints only
 * when something actually moved, so a still screen paints nothing.
 */
export interface MinimapView {
  playerTile: TilePoint;
  facing: Facing;
  camera: Camera;
  viewportW: number;
  viewportH: number;
  zoom: number;
}

/** True when two views would paint the same picture. */
export function sameMinimapView(
  a: MinimapView | null,
  b: MinimapView | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.playerTile.x === b.playerTile.x &&
    a.playerTile.y === b.playerTile.y &&
    a.facing === b.facing &&
    a.camera.sx === b.camera.sx &&
    a.camera.sy === b.camera.sy &&
    a.viewportW === b.viewportW &&
    a.viewportH === b.viewportH &&
    a.zoom === b.zoom
  );
}
