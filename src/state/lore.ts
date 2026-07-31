import type { GameState } from "./gameState";

/**
 * What this run has picked up off the floor.
 *
 * Memory shards are per-run collectibles: the ids live in GameState, so
 * they save, load, and start empty on a new character exactly like
 * flags do. Discovery *ever* is a separate record kept in meta-progress
 * (see ./meta.ts) — the codex reads both, the way it already reads
 * endings.
 *
 * Ordered, deduplicated, and append-only: the order is the order the
 * player found them in, which is worth keeping even though the codex
 * shows the authored reading order instead. Pure functions over plain
 * data — nothing here evaluates a gate (that is world/shards.ts, which
 * has the engine's requirement check) or writes storage.
 */
export interface LoreState {
  /** Shard ids collected this run, in pickup order, deduplicated. */
  collected: string[];
}

export function emptyLore(): LoreState {
  return { collected: [] };
}

/** Coerces any value into a valid LoreState; used by save migration. */
export function clampLore(value: unknown): LoreState {
  if (typeof value !== "object" || value === null) return emptyLore();
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.collected)) return emptyLore();
  const seen = new Set<string>();
  for (const entry of record.collected) {
    if (typeof entry === "string" && entry.length > 0) seen.add(entry);
  }
  return { collected: [...seen] };
}

export function hasShard(lore: LoreState, shardId: string): boolean {
  return lore.collected.includes(shardId);
}

/** Shard ids this run has collected, in pickup order. */
export function collectedShards(state: GameState): readonly string[] {
  return state.lore.collected;
}

export function collectedCount(lore: LoreState): number {
  return lore.collected.length;
}

/**
 * Files a shard into the run. Idempotent — picking up something already
 * collected returns the same state object, so a double-fire of the
 * interaction cannot double-count a shard or churn the autosave.
 */
export function collectShard(state: GameState, shardId: string): GameState {
  if (hasShard(state.lore, shardId)) return state;
  return {
    ...state,
    lore: { collected: [...state.lore.collected, shardId] },
  };
}
