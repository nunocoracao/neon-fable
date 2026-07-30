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
  seededAppearance,
} from "../character";
import { getEnemy } from "../data/enemies";
import {
  ambientLookSeed,
  type ComposedCharacter,
  type DeathReactionKind,
  type IsoMap,
} from "../iso";

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

/**
 * Descriptor source for ambient pedestrians, keyed by the sprite id
 * their look seed encodes. Memoized per id, so a whole crowd composes
 * once per distinct look and — because the provider's bake keys
 * serialize the descriptor — pedestrians who happen to share a look
 * also share every baked canvas. Non-ambient ids resolve to undefined
 * so this can be the scene's single entity source.
 */
export function ambientSpriteSource(): (
  id: string,
) => ComposedCharacter | undefined {
  const memo = new Map<string, ComposedCharacter | undefined>();
  return (id) => {
    if (!memo.has(id)) {
      const seed = ambientLookSeed(id);
      memo.set(
        id,
        seed === null
          ? undefined
          : safeCompose(
              { appearance: seededAppearance(seed) },
              `ambient pedestrian "${id}"`,
            ),
      );
    }
    return memo.get(id);
  };
}

/**
 * How an enemy archetype dies on screen. Content decides: an archetype
 * built of flesh crumples into a heap, a machine sparks out. Unknown
 * ids (and the player, who never passes through here) crumple.
 */
export function enemyDeathStyle(id: string | undefined): DeathReactionKind {
  return getEnemy(id ?? "")?.chassis === "machine" ? "sparkout" : "collapse";
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
