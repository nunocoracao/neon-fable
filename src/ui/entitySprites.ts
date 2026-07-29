/**
 * Bridges content data to the sprite provider for non-player
 * characters: memoized composed-descriptor sources for map NPC
 * interactables (authored named looks or stable seeded ambient
 * variety) and combat enemies (per archetype id). Like playerSprite,
 * corrupt content degrades to the stock look instead of crashing the
 * render loop — missing content degrades, never crashes.
 */
import {
  composeVisual,
  defaultAppearance,
  interactableVisual,
} from "../character";
import { getEnemy } from "../data/enemies";
import type { ComposedCharacter, IsoMap } from "../iso";

function safeCompose(
  visual: Parameters<typeof composeVisual>[0],
  label: string,
): ComposedCharacter {
  try {
    return composeVisual(visual);
  } catch (error) {
    console.error(`Invalid appearance for ${label}; rendering the default look`, error);
    return composeVisual({ appearance: defaultAppearance() });
  }
}

/**
 * Descriptor source for the NPC interactables of one map, keyed by
 * tile position (how the provider identifies them). Object sprites and
 * empty tiles resolve to undefined — the provider falls back.
 */
export function npcSpriteSource(
  map: IsoMap,
): (x: number, y: number) => ComposedCharacter | undefined {
  const memo = new Map<string, ComposedCharacter | undefined>();
  return (x, y) => {
    const key = `${x},${y}`;
    if (!memo.has(key)) {
      const npc = map.interactables.find(
        (i) => i.spriteId === "npc" && i.x === x && i.y === y,
      );
      memo.set(
        key,
        npc
          ? safeCompose(interactableVisual(map.id, npc), `NPC "${npc.id}"`)
          : undefined,
      );
    }
    return memo.get(key);
  };
}

/** Descriptor source for combat entities, keyed by enemy archetype id. */
export function enemySpriteSource(): (
  id: string,
) => ComposedCharacter | undefined {
  const memo = new Map<string, ComposedCharacter | undefined>();
  return (id) => {
    if (!memo.has(id)) {
      const visual = getEnemy(id)?.visual;
      memo.set(id, visual ? safeCompose(visual, `enemy "${id}"`) : undefined);
    }
    return memo.get(id);
  };
}
