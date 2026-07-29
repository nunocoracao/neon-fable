/**
 * NPC looks. Named map NPCs carry an authored CharacterVisual on their
 * interactable definition; unnamed/ambient ones derive a stable seeded
 * look from their map position, so a given passerby is always the same
 * person. Pure functions — the UI layer memoizes composition per scene.
 */
import type { Interactable } from "../iso/tilemap";
import { hashSeed } from "../state/rng";
import { seededAppearance, type CharacterVisual } from "./appearance";

/** Stable appearance seed for the NPC at a map position. */
export function npcSeed(mapId: string, x: number, y: number): number {
  return hashSeed(`${mapId}:${x},${y}`);
}

/** The interactable's authored look, or its stable seeded fallback. */
export function interactableVisual(
  mapId: string,
  interactable: Pick<Interactable, "x" | "y" | "visual">,
): CharacterVisual {
  return (
    interactable.visual ?? {
      appearance: seededAppearance(
        npcSeed(mapId, interactable.x, interactable.y),
      ),
    }
  );
}
