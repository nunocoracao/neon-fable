/**
 * Who is standing on a district, given what the city knows.
 *
 * ./mapDressing.ts in the content layer can rewrite an interactable in
 * place and deliberately cannot move, add, or delete one — that
 * restriction is what lets it promise the map lint's guarantees for
 * free. This pass makes the bigger promise: a live condition may put
 * somebody new on a map and take somebody off it. So the guarantees
 * have to be re-earned, and they are, in world.test.ts, against every
 * populated map any reachable combination of conditions can produce.
 *
 * Ordering: reactions apply in authored order, so where two could
 * rewrite the same interactable the first registered wins — the same
 * rule dressMap follows. A despawn beats a dress on the same target for
 * the same reason a deleted row cannot be edited.
 *
 * Applied at scene mount alongside dressMap (see ui/gameScreen.ts): a
 * street is different the next time you walk into it, never under your
 * feet mid-scene.
 */
import {
  SCENE_REACTIONS,
  spawnInteractable,
  type SceneReaction,
} from "../data/world";
import type { Interactable, IsoMap } from "../iso/tilemap";
import { conditionsAllow, hasCondition, type WorldState } from "./state";

/** Every reaction this world state has switched on for one map. */
export function liveReactions(
  mapId: string,
  world: WorldState,
): SceneReaction[] {
  return SCENE_REACTIONS.filter(
    (reaction) =>
      reaction.mapId === mapId &&
      conditionsAllow(world, { requires: [reaction.conditionId] }),
  );
}

/**
 * The map as this run's city has left it: the authored interactables
 * minus anybody a reaction has taken off, rewritten where a reaction
 * re-labels or re-points them, plus anybody a reaction has put on.
 *
 * Returns the map unchanged when nothing applies, so the common case
 * allocates nothing and the scene keeps its identity between mounts.
 */
export function populateMap(map: IsoMap, world: WorldState): IsoMap {
  const live = liveReactions(map.id, world);
  if (live.length === 0) return map;

  const despawned = new Set(live.flatMap((r) => [...(r.despawn ?? [])]));
  const dressings = live.flatMap((r) => [...(r.dress ?? [])]);
  const spawns = live.flatMap((r) => [...(r.spawn ?? [])]);

  const kept: Interactable[] = [];
  for (const thing of map.interactables) {
    if (despawned.has(thing.id)) continue;
    const dressing = dressings.find((d) => d.interactableId === thing.id);
    kept.push(
      dressing
        ? {
            ...thing,
            label: dressing.label ?? thing.label,
            interaction:
              dressing.nodeId !== undefined
                ? { kind: "dialogue", nodeId: dressing.nodeId }
                : thing.interaction,
          }
        : thing,
    );
  }
  // A spawn whose id is already on the map would shadow the authored
  // one for picking, focus, and the minimap alike. Content cannot do
  // that (world.test.ts fails on it); this only makes the runtime
  // behaviour of the bug obvious rather than subtle.
  const taken = new Set(kept.map((thing) => thing.id));
  for (const spawn of spawns) {
    if (taken.has(spawn.id)) continue;
    taken.add(spawn.id);
    kept.push(spawnInteractable(spawn));
  }

  return { ...map, interactables: kept };
}

/** True while a reaction's condition holds — the readable form for tests. */
export function reactionLive(reaction: SceneReaction, world: WorldState): boolean {
  return hasCondition(world, reaction.conditionId);
}
