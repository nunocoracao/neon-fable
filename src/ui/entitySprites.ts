/**
 * Bridges content data to the sprite provider for non-player
 * characters: memoized art sources for map NPC interactables (authored
 * named looks or stable seeded ambient variety), ambient pedestrians,
 * and combat enemies (per archetype *and* per look). Sources hand back
 * the provider's typed sprite-kind union, so a combat id may resolve to
 * a composed person or to an authored non-humanoid chassis and nothing
 * downstream has to know which. Like playerSprite, corrupt content
 * degrades to the stock look instead of crashing the render loop —
 * missing content degrades, never crashes.
 */
import {
  composeVisual,
  defaultAppearance,
  interactableVisual,
  seededAppearance,
  type CharacterVisual,
} from "../character";
import {
  companionLook,
  getCompanion,
  parseCompanionSpriteId,
} from "../data/companions";
import { enemyLook, getEnemy, parseEnemySpriteId } from "../data/enemies";
import {
  ambientLookSeed,
  characterArt,
  droneArt,
  mechArt,
  type ComposedCharacter,
  type DeathReactionKind,
  type EntityArt,
  type IsoMap,
} from "../iso";

function safeCompose(
  visual: CharacterVisual,
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
 * Art source for ambient pedestrians, keyed by the sprite id their look
 * seed encodes. Memoized per id, so a whole crowd composes once per
 * distinct look and — because the provider's bake keys serialize the
 * art — pedestrians who happen to share a look also share every baked
 * canvas. Non-ambient ids resolve to undefined so this can be the
 * scene's single entity source.
 */
export function ambientSpriteSource(): (id: string) => EntityArt | undefined {
  const memo = new Map<string, EntityArt | undefined>();
  return (id) => {
    if (!memo.has(id)) {
      const seed = ambientLookSeed(id);
      memo.set(
        id,
        seed === null
          ? undefined
          : characterArt(
              safeCompose(
                { appearance: seededAppearance(seed) },
                `ambient pedestrian "${id}"`,
              ),
            ),
      );
    }
    return memo.get(id);
  };
}

/**
 * How an enemy dies on screen. Content decides: an archetype built of
 * flesh crumples into a heap, a machine sparks out. Takes a sprite id,
 * so a look suffix is fine here; unknown ids (and the player, who never
 * passes through here) crumple.
 */
export function enemyDeathStyle(spriteId: string | undefined): DeathReactionKind {
  const { enemyId } = parseEnemySpriteId(spriteId ?? "");
  return getEnemy(enemyId)?.chassis === "machine" ? "sparkout" : "collapse";
}

/**
 * Art source for combat entities, keyed by enemy sprite id — an
 * archetype id plus which record of its look family this spawn wears
 * (see enemySpriteId). Two spawns of one archetype in different records
 * are two different ids, and therefore two different looks; two spawns
 * in the same record share the id, the composition, and every bake.
 *
 * The sprite kind comes off the archetype: humanoids resolve to a
 * composed appearance stack, the drone to its authored chassis.
 */
export function enemySpriteSource(): (id: string) => EntityArt | undefined {
  const memo = new Map<string, EntityArt | undefined>();
  return (spriteId) => {
    if (!memo.has(spriteId)) {
      memo.set(spriteId, resolveEnemyArt(spriteId));
    }
    return memo.get(spriteId);
  };
}

/**
 * Art source for companions, keyed by the sprite id that names the
 * companion and the look they are wearing (see companionSpriteId).
 * Re-dressing a companion changes the id, and therefore the bake —
 * the same rule enemy looks follow. Non-companion ids resolve to
 * undefined so this composes with the other sources.
 */
export function companionSpriteSource(): (id: string) => EntityArt | undefined {
  const memo = new Map<string, EntityArt | undefined>();
  return (spriteId) => {
    if (!memo.has(spriteId)) {
      memo.set(spriteId, resolveCompanionArt(spriteId));
    }
    return memo.get(spriteId);
  };
}

function resolveCompanionArt(spriteId: string): EntityArt | undefined {
  const parsed = parseCompanionSpriteId(spriteId);
  if (!parsed) return undefined;
  const companion = getCompanion(parsed.companionId);
  if (!companion) return undefined;
  return characterArt(
    safeCompose(
      companionLook(companion, parsed.lookId).visual,
      `companion "${spriteId}"`,
    ),
  );
}

/**
 * The entity source an explorable map runs on: a pedestrian's seeded
 * look if the id is an ambient one, otherwise whatever archetype and
 * record the id names. A street and an arena therefore draw the same
 * bodies from the same data — a Cordon enforcer standing at a gate is
 * the enforcer the next fight opens with, and a drone hanging over a
 * plaza is the drone, not a person in a hood.
 */
export function sceneSpriteSource(): (id: string) => EntityArt | undefined {
  const ambient = ambientSpriteSource();
  const enemy = enemySpriteSource();
  const companion = companionSpriteSource();
  return (id) => companion(id) ?? ambient(id) ?? enemy(id);
}

function resolveEnemyArt(spriteId: string): EntityArt | undefined {
  const { enemyId, lookIndex } = parseEnemySpriteId(spriteId);
  const enemy = getEnemy(enemyId);
  if (!enemy) return undefined;
  if (enemy.spriteKind === "drone") return droneArt(enemy.droneArt);
  if (enemy.spriteKind === "mech") return mechArt(enemy.mechArt);
  const visual = enemyLook(enemy, lookIndex);
  return visual
    ? characterArt(safeCompose(visual, `enemy "${spriteId}"`))
    : undefined;
}
