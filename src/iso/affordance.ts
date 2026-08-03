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

/**
 * Why something is in focus: pointed at, within arm's reach, or picked
 * off the map with the keyboard. "picked" is the keyboard's answer to
 * the cursor — a player with no pointer has to be able to name a thing
 * across the plaza before they can ask to walk to it.
 */
export type FocusReason = "hover" | "nearby" | "picked";

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
  /**
   * The interactable the keyboard has picked, if any. It outranks both
   * the cursor and arm's reach: a player who tabbed onto the far door
   * meant the far door, and the outline must agree with the key they
   * are about to press.
   */
  pickedId?: string | null;
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
 * The single interactable the scene should light up: whatever the
 * keyboard has picked, else the one under the cursor if the cursor is
 * on one (at any distance — pointing at a thing names it), else the
 * nearest one in reach. Never more than one.
 */
export function focusInteractable(
  map: IsoMap,
  query: FocusQuery,
  range: number = INTERACT_RANGE,
): FocusedInteractable | null {
  const { playerTile, hoverTile, pickedId } = query;
  const picked = pickedId
    ? map.interactables.find((entry) => entry.id === pickedId)
    : undefined;
  if (picked) return focused(picked, "picked", playerTile, range);
  const hovered = hoverTile
    ? interactableAt(map, hoverTile.x, hoverTile.y)
    : undefined;
  if (hovered) return focused(hovered, "hover", playerTile, range);
  const nearby = nearestInteractable(map, playerTile, range);
  return nearby ? focused(nearby, "nearby", playerTile, range) : null;
}

/**
 * The keyboard's walk through everything on the map worth touching:
 * nearest first, in the same total order the reach check uses, so
 * tabbing round a plaza always visits the same things in the same
 * sequence. `currentId` null (or unknown — an id from the map that was
 * just left) starts at whichever end the direction implies, so the
 * first press lands on the nearest thing forwards and the last one
 * backwards. Wraps at both ends; null when the map holds nothing.
 */
export function cycleInteractable(
  map: IsoMap,
  from: TilePoint,
  currentId: string | null,
  direction: 1 | -1,
): Interactable | null {
  const ordered = map.interactables
    .map((interactable) => ({
      interactable,
      distance: tileDistance(from, interactable),
    }))
    .sort(compareCandidates)
    .map((candidate) => candidate.interactable);
  if (ordered.length === 0) return null;
  const index = ordered.findIndex((entry) => entry.id === currentId);
  if (index === -1) {
    return (direction === 1 ? ordered[0] : ordered[ordered.length - 1]) ?? null;
  }
  return ordered[(index + direction + ordered.length) % ordered.length] ?? null;
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
