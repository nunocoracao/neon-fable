/**
 * Keyed LRU cache with approximate byte accounting, used by the sprite
 * provider to bound the memory held by baked sprite canvases. Pure
 * bookkeeping — values and their size estimate come from the caller, so
 * the eviction logic is unit-testable without a canvas. Every hit
 * refreshes recency; an insert that pushes past the byte budget evicts
 * least-recently-used entries (never the entry just inserted, so a
 * single oversized value still caches).
 */

export interface SpriteCacheStats {
  entries: number;
  /** Approximate bytes held: the sum of sizeOf over cached values. */
  bytes: number;
  budgetBytes: number;
  hits: number;
  misses: number;
  evictions: number;
}

export interface SpriteCache<V> {
  /** Return the cached value for key, making and caching it on a miss. */
  get(key: string, make: () => V): V;
  stats(): SpriteCacheStats;
}

export function createSpriteCache<V>(
  budgetBytes: number,
  sizeOf: (value: V) => number,
): SpriteCache<V> {
  // Map iteration order is insertion order; re-inserting on hit makes
  // the first key the least recently used.
  const entries = new Map<string, { value: V; bytes: number }>();
  let bytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  return {
    get(key: string, make: () => V): V {
      const existing = entries.get(key);
      if (existing) {
        hits++;
        entries.delete(key);
        entries.set(key, existing);
        return existing.value;
      }
      misses++;
      const value = make();
      const size = Math.max(0, sizeOf(value));
      entries.set(key, { value, bytes: size });
      bytes += size;
      for (const oldest of entries.keys()) {
        if (bytes <= budgetBytes || oldest === key) break;
        bytes -= entries.get(oldest)?.bytes ?? 0;
        entries.delete(oldest);
        evictions++;
      }
      return value;
    },

    stats(): SpriteCacheStats {
      return {
        entries: entries.size,
        bytes,
        budgetBytes,
        hits,
        misses,
        evictions,
      };
    },
  };
}
