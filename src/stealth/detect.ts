/**
 * Being noticed: the one rule that turns a crossing into a fight.
 *
 * Two senses, and they are not symmetrical. Sight is absolute — a tile
 * inside a cone is a tile you are standing on in front of somebody, and
 * no amount of care changes that. Sound is the part the player controls:
 * ordinary walking carries one tile, so the ring around a guard is only
 * dangerous to somebody in a hurry, and crouching silences it entirely.
 *
 * Both are asked at tick boundaries and nowhere else (see ./run.ts),
 * which is what makes timing a crossing the actual skill: a tile that is
 * lit for one tick can be walked over between two of them.
 */
import {
  getStealthGuard,
  type StealthRect,
  type StealthZone,
} from "../data/stealth";
import type { TilePoint } from "../iso/coords";
import { heardBy, seenBy, type GuardView } from "./watch";

/** Which sense had you. */
export type DetectionSense = "sight" | "sound";

export interface Detection {
  guardId: string;
  /** The guard's own name, for the line the shell shows. */
  name: string;
  sense: DetectionSense;
  /** What they say — authored on the guard. */
  bark: string;
}

/** True if a tile falls inside a zone's watched rectangle. */
export function withinBounds(bounds: StealthRect, tile: TilePoint): boolean {
  return (
    tile.x >= bounds.x &&
    tile.y >= bounds.y &&
    tile.x < bounds.x + bounds.width &&
    tile.y < bounds.y + bounds.height
  );
}

export interface DetectionQuery {
  /** Crouch-walking: silent, and no help at all against a pair of eyes. */
  crouched: boolean;
}

/**
 * Who has you, standing on this tile, right now — or null for nobody.
 * Outside the zone's bounds the answer is always nobody: a cone may
 * reach past the edge of a crossing, but the crossing is where the
 * watch applies, and a player stood on the far bank is past it.
 */
export function detectAt(
  zone: StealthZone,
  views: readonly GuardView[],
  tile: TilePoint,
  query: DetectionQuery,
): Detection | null {
  if (!withinBounds(zone.bounds, tile)) return null;
  const seen = seenBy(views, tile);
  if (seen) return detection(zone, seen, "sight");
  if (query.crouched) return null;
  const heard = heardBy(views, tile);
  return heard ? detection(zone, heard, "sound") : null;
}

function detection(
  zone: StealthZone,
  view: GuardView,
  sense: DetectionSense,
): Detection {
  const guard = getStealthGuard(zone, view.guardId);
  return {
    guardId: view.guardId,
    name: view.name,
    sense,
    bark: guard?.bark ?? "",
  };
}
