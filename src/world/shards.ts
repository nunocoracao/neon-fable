/**
 * The memory shards still lying on a district.
 *
 * A fourth layer over a map, joined at scene mount alongside dressMap
 * and populateMap (see ui/district.ts): the authored chips this run has
 * not picked up yet, dropped onto the map as interactables. A shard
 * this run is already carrying is simply not there — picking one up is
 * a pickup, and the codex is where it lives afterwards.
 *
 * Two things are deliberately *not* here. The chips are not part of map
 * data, because they come and go with a run's collection and a district
 * is authored once. And the gate on a sealed shard is not a placement
 * rule: a gated chip lies on the floor in plain sight and refuses to
 * open, which is the only way a player can learn there is something to
 * come back for. `shardOpens` is the whole of that decision, and it is
 * the engine's own requirement check — no second evaluator.
 */
import { LORE_SHARDS, type LoreShard } from "../data/lore";
import type { Interactable, IsoMap } from "../iso/tilemap";
import { checkRequirements } from "../narrative/requirements";
import type { GameState } from "../state/gameState";
import { hasShard, type LoreState } from "../state/lore";

/** Every authored shard lying on one map, in reading order. */
export function mapShards(mapId: string): LoreShard[] {
  return LORE_SHARDS.filter((shard) => shard.mapId === mapId);
}

/**
 * The Interactable a shard becomes. Shaped here rather than in content
 * so the facts about what a chip *is* — always the shard sprite, always
 * a lore interaction, never a way out, and never a minimap pip — are
 * one decision. No pip on purpose: signposting a collectible on the
 * overview would turn finding one into walking to a marker.
 */
export function shardInteractable(shard: LoreShard): Interactable {
  return {
    id: shard.id,
    x: shard.x,
    y: shard.y,
    label: "Memory shard",
    spriteId: "shard",
    interaction: { kind: "lore", shardId: shard.id },
    minimap: false,
  };
}

/**
 * The map with this run's uncollected shards on it. Returns the map
 * unchanged when there is nothing to add, so maps with no shards (every
 * arena) keep their identity between mounts.
 *
 * A chip whose tile is already taken by an interactable is dropped
 * rather than allowed to shadow it — content cannot do that
 * (lore.test.ts fails on it), so this only keeps the runtime behaviour
 * of the bug obvious instead of subtle.
 */
export function placeShards(map: IsoMap, lore: LoreState): IsoMap {
  const taken = new Set(map.interactables.map((thing) => thing.id));
  const tiles = new Set(map.interactables.map((thing) => `${thing.x},${thing.y}`));
  const dropped: Interactable[] = [];
  for (const shard of mapShards(map.id)) {
    if (hasShard(lore, shard.id)) continue;
    if (taken.has(shard.id) || tiles.has(`${shard.x},${shard.y}`)) continue;
    taken.add(shard.id);
    tiles.add(`${shard.x},${shard.y}`);
    dropped.push(shardInteractable(shard));
  }
  if (dropped.length === 0) return map;
  return { ...map, interactables: [...map.interactables, ...dropped] };
}

/**
 * Whether this character can read the chip they are standing over.
 * Ungated shards are vacuously open; the three sealed ones run their
 * authored Requirement bundle through the engine's own evaluator, so a
 * shard's gate behaves exactly like a dialogue choice's.
 */
export function shardOpens(state: GameState, shard: LoreShard): boolean {
  return checkRequirements(state, [...(shard.requirements ?? [])]);
}
