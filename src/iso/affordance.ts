/**
 * Which interactable the scene is offering the player right now, as
 * pure functions over a map and two tile positions. The scene turns the
 * answer into an outline, a floating name chip, and a keyboard prompt;
 * nothing here draws or reads settings.
 *
 * Only declared interactables are ever candidates, so scenery props and
 * ambient pedestrians (which are not interactables at all — see
 * ./ambient.ts) can never light up.
 */
import { tileDistance, type TilePoint } from "./coords";
import { interactableAt, type Interactable, type IsoMap } from "./tilemap";

/**
 * Manhattan tiles from which an interactable can be triggered. Matches
 * the scene's own reach check: what highlights is exactly what a walk
 * up to it would fire.
 */
export const INTERACT_RANGE = 1;

/** Why something is in focus: pointed at, or within arm's reach. */
export type FocusReason = "hover" | "nearby";

export interface FocusedInteractable {
  interactable: Interactable;
  reason: FocusReason;
  /** Manhattan tiles between the player and it. */
  distance: number;
  /** Whether it can be triggered from where the player stands. */
  inRange: boolean;
}

/** Where the player stands and what the cursor is over, if anything. */
export interface FocusQuery {
  playerTile: TilePoint;
  hoverTile?: TilePoint | null;
}

/**
 * Ordering among candidates: nearest first, then north-to-south,
 * west-to-east, then by id. Every step is a total order over data the
 * map already fixes, so the same two neighbours always resolve the same
 * way — never "whichever the map listed first".
 */
function compareCandidates(
  a: { interactable: Interactable; distance: number },
  b: { interactable: Interactable; distance: number },
): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  if (a.interactable.y !== b.interactable.y) {
    return a.interactable.y - b.interactable.y;
  }
  if (a.interactable.x !== b.interactable.x) {
    return a.interactable.x - b.interactable.x;
  }
  return a.interactable.id < b.interactable.id ? -1 : 1;
}

/** Every interactable within `range` of a tile, nearest first. */
export function interactablesInRange(
  map: IsoMap,
  from: TilePoint,
  range: number = INTERACT_RANGE,
): Interactable[] {
  return map.interactables
    .map((interactable) => ({
      interactable,
      distance: tileDistance(from, interactable),
    }))
    .filter((candidate) => candidate.distance <= range)
    .sort(compareCandidates)
    .map((candidate) => candidate.interactable);
}

/** The one interactable in reach, or null when none is. Nearest wins. */
export function nearestInteractable(
  map: IsoMap,
  from: TilePoint,
  range: number = INTERACT_RANGE,
): Interactable | null {
  return interactablesInRange(map, from, range)[0] ?? null;
}

/**
 * The single interactable the scene should light up: the one under the
 * cursor if the cursor is on one (at any distance — pointing at a thing
 * names it), else the nearest one in reach. Never more than one.
 */
export function focusInteractable(
  map: IsoMap,
  query: FocusQuery,
  range: number = INTERACT_RANGE,
): FocusedInteractable | null {
  const { playerTile, hoverTile } = query;
  const hovered = hoverTile
    ? interactableAt(map, hoverTile.x, hoverTile.y)
    : undefined;
  if (hovered) return focused(hovered, "hover", playerTile, range);
  const nearby = nearestInteractable(map, playerTile, range);
  return nearby ? focused(nearby, "nearby", playerTile, range) : null;
}

function focused(
  interactable: Interactable,
  reason: FocusReason,
  playerTile: TilePoint,
  range: number,
): FocusedInteractable {
  const distance = tileDistance(playerTile, interactable);
  return { interactable, reason, distance, inRange: distance <= range };
}

/**
 * Outline colors keyed by the accessibility palette in force. Each is
 * the same hue as the resting marker that palette already lays under
 * every interactable (see TELEGRAPH_HIGHLIGHTS in ./telegraphPalette.ts),
 * so the outline reads as that marker brightening rather than as a new
 * color arriving.
 *
 * The colorblind-assist option is the consumer this table was left for:
 * it picks an id here and nothing else in the renderer needs to know a
 * palette exists (see src/data/accessibility.ts).
 */
export const OUTLINE_COLORS = {
  neon: "#ffd873",
  assist: "#ffe89a",
} as const;

export type OutlinePaletteId = keyof typeof OUTLINE_COLORS;

export const DEFAULT_OUTLINE_PALETTE: OutlinePaletteId = "neon";

/** The outline color for a palette; unknown or absent falls back. */
export function outlineColor(palette?: string | null): string {
  if (palette !== null && palette !== undefined && palette in OUTLINE_COLORS) {
    return OUTLINE_COLORS[palette as OutlinePaletteId];
  }
  return OUTLINE_COLORS[DEFAULT_OUTLINE_PALETTE];
}
