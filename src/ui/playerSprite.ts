/**
 * Bridges the session's GameState to the sprite provider: a live
 * player-descriptor getter that recomposes only when the appearance or
 * equipment reference changes, so scenes can call it every frame and
 * the provider's identity-keyed caching stays effective. A corrupt
 * appearance degrades to the stock look instead of crashing the render
 * loop (missing content degrades, never crashes).
 */
import {
  composeCharacter,
  defaultAppearance,
  type Appearance,
} from "../character";
import type { EquipmentState } from "../inventory/equipment";
import type { ComposedCharacter } from "../iso";
import type { Session } from "./session";

export function playerSpriteSource(session: Session): () => ComposedCharacter {
  let seenAppearance: Appearance | null = null;
  let seenEquipment: EquipmentState | null = null;
  let composed: ComposedCharacter | null = null;
  return () => {
    const { appearance, equipment } = session.state.player;
    if (!composed || appearance !== seenAppearance || equipment !== seenEquipment) {
      seenAppearance = appearance;
      seenEquipment = equipment;
      try {
        composed = composeCharacter(appearance, equipment);
      } catch (error) {
        console.error("Invalid player appearance; rendering the default look", error);
        composed = composeCharacter(defaultAppearance(), equipment);
      }
    }
    return composed;
  };
}
