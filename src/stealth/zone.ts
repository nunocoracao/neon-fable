/**
 * Which zone, if any, is posted on the map the player just walked onto.
 *
 * Three ways a zone stops being live, and all three are readings of the
 * run rather than switches anybody throws: its own requirements have
 * stopped holding, it has already been settled one way or the other, or
 * the fight it is an alternative to has already been had. That last one
 * is what stops a player who fought the detail from finding the detail
 * still walking the aisle afterwards.
 */
import { combatResultFlag } from "../combat/outcome";
import {
  SILENT_TAKEDOWN_TAG,
  stealthZoneFlag,
  stealthZonesOnMap,
  type StealthZone,
} from "../data/stealth";
import { dialogueUnlockTags } from "../inventory";
import { checkRequirements } from "../narrative/requirements";
import type { GameState } from "../state/gameState";

/** True if this zone is still standing for this run. */
export function isZoneLive(state: GameState, zone: StealthZone): boolean {
  if (state.flags[stealthZoneFlag(zone.id)] !== undefined) return false;
  if (state.flags[combatResultFlag(zone.encounterId)] !== undefined) return false;
  return checkRequirements(state, [...(zone.requires ?? [])]);
}

/**
 * The zone the player is walking into, or null for an ordinary map.
 * Authored order breaks ties; no map declares two today, and a lint
 * would be the place to say so if that ever mattered.
 */
export function activeStealthZone(
  state: GameState,
  mapId: string,
): StealthZone | null {
  return stealthZonesOnMap(mapId).find((zone) => isZoneLive(state, zone)) ?? null;
}

/**
 * Whether the player is carrying the chrome that buys a second silent
 * takedown. A tag, not an item id — see SILENT_TAKEDOWN_TAG.
 */
export function hasQuietHands(state: GameState): boolean {
  return dialogueUnlockTags(state.player).includes(SILENT_TAKEDOWN_TAG);
}
