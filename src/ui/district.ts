/**
 * The district a run walks into, assembled.
 *
 * Three layers land on one map, in a fixed order, and this is the only
 * place they are joined:
 *
 *  1. the authored map (src/data/maps.ts),
 *  2. `dressMap` — an interactable a settled quest re-labelled or
 *     re-pointed (src/data/mapDressing.ts),
 *  3. `populateMap` — the people a live world condition posts here, and
 *     the ones it has moved on (src/world/population.ts),
 *
 * plus the running order for whatever public screens the map carries.
 *
 * Resolved once per mount, and a mount is what arriving on a map is —
 * so a street the story changed is different the next time the player
 * walks into it, never under their feet mid-scene.
 */
import { dressMap, requireMap, type NewsChannelId } from "../data";
import type { IsoMap } from "../iso";
import type { GameState } from "../state";
import { deriveWorldState, newsStrip, populateMap, type WorldState } from "../world";

export interface District {
  /** What the city has noticed about this run. */
  world: WorldState;
  /** The map as this run has left it. */
  map: IsoMap;
  /** Running order per public screen id, for the scene's ticker. */
  newsStrips: Record<string, string[]>;
}

export function resolveDistrict(state: GameState, mapId: string): District {
  const world = deriveWorldState(state);
  const map = populateMap(dressMap(requireMap(mapId), state.flags), world);
  const newsStrips: Record<string, string[]> = {};
  for (const screen of map.screens ?? []) {
    newsStrips[screen.id] = newsStrip(
      map.id,
      screen.id,
      screen.channel as NewsChannelId,
      world,
    );
  }
  return { world, map, newsStrips };
}
