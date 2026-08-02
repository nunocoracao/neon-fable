/**
 * Frame-cost bookkeeping: the rolling window the dev HUD reads and the
 * per-frame counters the renderer fills in.
 *
 * Two rules shape this file. The window is a ring buffer and pushing a
 * sample allocates nothing — a frame-time meter that produced garbage
 * would be measuring itself. And the counters are a plain mutable
 * record the renderer is handed, rather than a return value: a scene
 * that wants no instrumentation passes none and the renderer's counting
 * is a handful of `if`-free increments on an object nobody reads.
 *
 * Everything here is pure arithmetic, so what the HUD claims is
 * testable without a canvas or a clock.
 */
import type { SpriteCacheStats } from "./art/spriteCache";

/** What a window of frame samples says about how the scene is running. */
export interface FrameTimings {
  /** Samples the window is holding (0 before the first frame). */
  samples: number;
  avgMs: number;
  /** Nearest-rank 95th percentile: the hitch figure, not the average. */
  p95Ms: number;
  maxMs: number;
  /** Frames per second implied by the average; 0 with no samples. */
  fps: number;
}

export interface FrameWindow {
  /** Record one frame's cost in milliseconds. Allocation-free. */
  push(ms: number): void;
  /** Read the window. Allocates — the HUD reads a few times a second. */
  read(): FrameTimings;
  clear(): void;
}

/** How many frames the rolling window holds: two seconds at 60fps. */
export const FRAME_WINDOW_SIZE = 120;

const EMPTY_TIMINGS: FrameTimings = {
  samples: 0,
  avgMs: 0,
  p95Ms: 0,
  maxMs: 0,
  fps: 0,
};

/**
 * The nearest-rank 95th percentile of an ascending array: the smallest
 * sample at or above 95% of the distribution. Exported because the rank
 * rule is the part of a p95 people disagree about.
 */
export function percentileIndex(count: number, fraction: number): number {
  if (count <= 0) return 0;
  const rank = Math.ceil(fraction * count);
  return Math.min(count - 1, Math.max(0, rank - 1));
}

export function createFrameWindow(size: number = FRAME_WINDOW_SIZE): FrameWindow {
  const capacity = Math.max(1, Math.trunc(size));
  const samples = new Float64Array(capacity);
  const sorted = new Float64Array(capacity);
  let count = 0;
  let next = 0;

  return {
    push(ms: number): void {
      if (!Number.isFinite(ms) || ms < 0) return;
      samples[next] = ms;
      next = (next + 1) % capacity;
      if (count < capacity) count++;
    },

    read(): FrameTimings {
      if (count === 0) return EMPTY_TIMINGS;
      let total = 0;
      let max = 0;
      for (let i = 0; i < count; i++) {
        const value = samples[i] ?? 0;
        total += value;
        if (value > max) max = value;
        sorted[i] = value;
      }
      const window = sorted.subarray(0, count);
      window.sort();
      const avgMs = total / count;
      return {
        samples: count,
        avgMs,
        p95Ms: window[percentileIndex(count, 0.95)] ?? 0,
        maxMs: max,
        fps: avgMs > 0 ? 1000 / avgMs : 0,
      };
    },

    clear(): void {
      count = 0;
      next = 0;
    },
  };
}

/**
 * What one frame of `renderScene` did, filled in as it paints. Culled
 * counts are the things the pass considered and skipped, so drawn +
 * culled is the work the renderer would have done before ./cull.ts.
 */
export interface RenderCounters {
  /** Every drawImage the frame issues, across all passes. */
  draws: number;
  groundDrawn: number;
  groundCulled: number;
  /** Depth-sorted objects: props, interactables, entities, set pieces. */
  objectsDrawn: number;
  objectsCulled: number;
  glowsDrawn: number;
  glowsCulled: number;
}

export function createRenderCounters(): RenderCounters {
  return {
    draws: 0,
    groundDrawn: 0,
    groundCulled: 0,
    objectsDrawn: 0,
    objectsCulled: 0,
    glowsDrawn: 0,
    glowsCulled: 0,
  };
}

/** Zero a counter record in place, ready for the next frame. */
export function clearRenderCounters(counters: RenderCounters): void {
  counters.draws = 0;
  counters.groundDrawn = 0;
  counters.groundCulled = 0;
  counters.objectsDrawn = 0;
  counters.objectsCulled = 0;
  counters.glowsDrawn = 0;
  counters.glowsCulled = 0;
}

/** Fraction of everything considered this frame that was culled (0..1). */
export function culledFraction(counters: RenderCounters): number {
  const culled =
    counters.groundCulled + counters.objectsCulled + counters.glowsCulled;
  const drawn =
    counters.groundDrawn + counters.objectsDrawn + counters.glowsDrawn;
  const total = culled + drawn;
  return total === 0 ? 0 : culled / total;
}

/** Bakes, hits, and evictions between two readings of a bake cache. */
export interface CacheDelta {
  /** Sprites baked in the interval — the number that must reach 0. */
  bakes: number;
  hits: number;
  evictions: number;
  entries: number;
  bytes: number;
}

export function cacheDelta(
  before: SpriteCacheStats | null,
  after: SpriteCacheStats,
): CacheDelta {
  return {
    bakes: after.misses - (before?.misses ?? 0),
    hits: after.hits - (before?.hits ?? 0),
    evictions: after.evictions - (before?.evictions ?? 0),
    entries: after.entries,
    bytes: after.bytes,
  };
}

/** One frame's report from the scene to whoever is measuring it. */
export interface ScenePerfSample {
  /** Milliseconds of JS the frame spent stepping and painting. */
  frameMs: number;
  /** Milliseconds since the previous frame started — real pacing. */
  deltaMs: number;
  counters: RenderCounters;
}

/**
 * The HUD's readout, as lines of `label  value`. Formatting lives here
 * rather than in the DOM layer so what the numbers say is a unit test
 * and not a screenshot.
 *
 * Two windows, because they answer different questions. `pacing` is the
 * wall clock between frames — the only honest source of an fps figure,
 * and the p95 the "no hitches" target is written against, since a
 * garbage-collection pause lands between frames rather than inside one.
 * `cost` is the JS the scene spends stepping and painting, which is what
 * an optimization here can actually move.
 */
export function perfHudLines(
  pacing: FrameTimings,
  cost: FrameTimings,
  counters: RenderCounters,
  cache: CacheDelta | null,
): string[] {
  const lines = [
    `fps    ${pacing.fps.toFixed(1)} · frame ${pacing.avgMs.toFixed(2)}ms` +
      ` · p95 ${pacing.p95Ms.toFixed(2)}ms · worst ${pacing.maxMs.toFixed(2)}ms`,
    `cpu    ${cost.avgMs.toFixed(2)}ms avg · ${cost.p95Ms.toFixed(2)}ms p95`,
    `draws  ${counters.draws} · culled ${(culledFraction(counters) * 100).toFixed(0)}%`,
    `ground ${counters.groundDrawn}/${counters.groundDrawn + counters.groundCulled}` +
      ` · obj ${counters.objectsDrawn}/${counters.objectsDrawn + counters.objectsCulled}` +
      ` · glow ${counters.glowsDrawn}/${counters.glowsDrawn + counters.glowsCulled}`,
  ];
  if (cache) {
    lines.push(
      `bakes  ${cache.bakes} · entries ${cache.entries}` +
        ` · ${(cache.bytes / (1024 * 1024)).toFixed(1)}MiB` +
        (cache.evictions > 0 ? ` · evicted ${cache.evictions}` : ""),
    );
  }
  return lines;
}
