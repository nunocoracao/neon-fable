/**
 * The dev frame-time HUD: a corner readout of how the scene in front of
 * it is actually running — frames per second and the p95 that catches
 * hitches the average hides, the JS a frame owns, what the renderer
 * drew and what it culled, and how many sprites the bake cache had to
 * make (which in a warmed scene must be zero).
 *
 * Deliberately thin. Every number is computed by the pure code in
 * src/iso/perf.ts and every line is formatted there too, so what the
 * HUD claims is a unit test rather than a screenshot; this file feeds it
 * samples and writes text into a box.
 */
import type { SpriteCacheStats } from "../iso/art/spriteCache";
import {
  cacheDelta,
  createFrameWindow,
  createRenderCounters,
  perfHudLines,
  type RenderCounters,
  type ScenePerfSample,
} from "../iso/perf";

export interface PerfHudOptions {
  /** Where the panel is attached. */
  host: HTMLElement;
  /**
   * The bake cache to watch, if there is one to watch. Read on the same
   * throttle as the rest, so a scene that is re-baking every frame is
   * visible without the HUD itself walking the cache 60 times a second.
   */
  cacheStats?: () => SpriteCacheStats;
  /** Milliseconds between DOM writes; the window keeps every frame. */
  updateMs?: number;
}

export interface PerfHud {
  /** Feed one frame, straight off the scene's onPerf hook. */
  sample(sample: ScenePerfSample): void;
  /** Drop every sample held — used when a run is restarted. */
  reset(): void;
  destroy(): void;
}

/**
 * How often the panel redraws. Fast enough to watch a hitch arrive,
 * slow enough that the numbers can be read and that the HUD's own
 * layout work is a rounding error on the frame it is reporting.
 */
export const PERF_HUD_UPDATE_MS = 250;

export function createPerfHud(options: PerfHudOptions): PerfHud {
  const updateMs = options.updateMs ?? PERF_HUD_UPDATE_MS;
  const pacing = createFrameWindow();
  const cost = createFrameWindow();

  const panel = document.createElement("pre");
  panel.className = "nf-perf-hud";
  panel.setAttribute("aria-hidden", "true");
  options.host.append(panel);

  /** Wall clock of the last DOM write; null until the first sample. */
  let paintedAt: number | null = null;
  /** Cache reading the bake count is measured against — the last paint. */
  let cacheMark: SpriteCacheStats | null = null;
  /** The most recent frame's counts, copied off the scene's record. */
  let lastCounters: RenderCounters = createRenderCounters();

  function paint(): void {
    const stats = options.cacheStats?.();
    const delta = stats ? cacheDelta(cacheMark, stats) : null;
    cacheMark = stats ?? null;
    panel.textContent = perfHudLines(
      pacing.read(),
      cost.read(),
      lastCounters,
      delta,
    ).join("\n");
  }

  return {
    sample(sample: ScenePerfSample): void {
      pacing.push(sample.deltaMs);
      cost.push(sample.frameMs);
      // The counters are one mutable record the scene reuses, so the
      // HUD copies the frame it is going to report rather than holding
      // a reference that has moved on by the time it paints.
      lastCounters = { ...sample.counters };
      const now = performance.now();
      if (paintedAt !== null && now - paintedAt < updateMs) return;
      paintedAt = now;
      paint();
    },

    reset(): void {
      pacing.clear();
      cost.clear();
      lastCounters = createRenderCounters();
      cacheMark = null;
      paintedAt = null;
      paint();
    },

    destroy(): void {
      panel.remove();
    },
  };
}
