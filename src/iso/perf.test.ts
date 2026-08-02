import { describe, expect, it } from "vitest";
import type { SpriteCacheStats } from "./art/spriteCache";
import {
  FRAME_WINDOW_SIZE,
  cacheDelta,
  clearRenderCounters,
  createFrameWindow,
  createRenderCounters,
  culledFraction,
  percentileIndex,
  perfHudLines,
} from "./perf";

function stats(partial: Partial<SpriteCacheStats>): SpriteCacheStats {
  return {
    entries: 0,
    bytes: 0,
    budgetBytes: 1024,
    hits: 0,
    misses: 0,
    evictions: 0,
    ...partial,
  };
}

describe("frame window", () => {
  it("reads nothing before the first frame", () => {
    expect(createFrameWindow().read()).toEqual({
      samples: 0,
      avgMs: 0,
      p95Ms: 0,
      maxMs: 0,
      fps: 0,
    });
  });

  it("averages the samples it holds and derives fps from that", () => {
    const window = createFrameWindow(8);
    for (const ms of [10, 20, 30]) window.push(ms);
    const read = window.read();
    expect(read.samples).toBe(3);
    expect(read.avgMs).toBeCloseTo(20);
    expect(read.maxMs).toBe(30);
    expect(read.fps).toBeCloseTo(50);
  });

  it("keeps only the most recent `size` frames", () => {
    const window = createFrameWindow(4);
    for (const ms of [100, 100, 100, 100, 1, 1, 1, 1]) window.push(ms);
    const read = window.read();
    expect(read.samples).toBe(4);
    expect(read.avgMs).toBeCloseTo(1);
    // The old hitches have scrolled off — a stale worst case would make
    // the HUD keep accusing the scene of a hitch it already recovered
    // from.
    expect(read.maxMs).toBe(1);
  });

  it("reports the p95 by nearest rank, so a hitch in the tail shows", () => {
    const window = createFrameWindow(100);
    for (let i = 0; i < 94; i++) window.push(5);
    for (let i = 0; i < 6; i++) window.push(80);
    const read = window.read();
    // Six hitches in a hundred frames is past the 95th percentile; the
    // average barely moves, which is the whole reason the HUD shows both.
    expect(read.p95Ms).toBe(80);
    expect(read.avgMs).toBeCloseTo((94 * 5 + 6 * 80) / 100);
  });

  it("leaves the p95 clean when the tail is thinner than 5%", () => {
    const window = createFrameWindow(100);
    for (let i = 0; i < 96; i++) window.push(5);
    for (let i = 0; i < 4; i++) window.push(80);
    expect(window.read().p95Ms).toBe(5);
    expect(window.read().maxMs).toBe(80);
  });

  it("ranks by count, never past the end", () => {
    expect(percentileIndex(0, 0.95)).toBe(0);
    expect(percentileIndex(1, 0.95)).toBe(0);
    expect(percentileIndex(20, 0.95)).toBe(18);
    expect(percentileIndex(100, 0.95)).toBe(94);
    expect(percentileIndex(100, 1)).toBe(99);
  });

  it("ignores samples that are not a duration", () => {
    const window = createFrameWindow(4);
    window.push(Number.NaN);
    window.push(-1);
    window.push(Number.POSITIVE_INFINITY);
    expect(window.read().samples).toBe(0);
  });

  it("clears back to empty", () => {
    const window = createFrameWindow(4);
    window.push(16);
    window.clear();
    expect(window.read().samples).toBe(0);
  });

  it("holds two seconds of 60fps frames by default", () => {
    expect(FRAME_WINDOW_SIZE).toBe(120);
  });
});

describe("render counters", () => {
  it("starts and clears at zero", () => {
    const counters = createRenderCounters();
    expect(Object.values(counters).every((value) => value === 0)).toBe(true);
    counters.draws = 9;
    counters.glowsCulled = 3;
    clearRenderCounters(counters);
    expect(Object.values(counters).every((value) => value === 0)).toBe(true);
  });

  it("reports the share of considered work that was culled", () => {
    const counters = createRenderCounters();
    expect(culledFraction(counters)).toBe(0);
    counters.groundDrawn = 100;
    counters.groundCulled = 100;
    counters.glowsDrawn = 50;
    counters.glowsCulled = 150;
    expect(culledFraction(counters)).toBeCloseTo(250 / 400);
  });
});

describe("cache delta", () => {
  it("counts bakes since the previous reading", () => {
    const before = stats({ misses: 40, hits: 100, evictions: 1 });
    const after = stats({ misses: 42, hits: 400, evictions: 1, entries: 42, bytes: 99 });
    expect(cacheDelta(before, after)).toEqual({
      bakes: 2,
      hits: 300,
      evictions: 0,
      entries: 42,
      bytes: 99,
    });
  });

  it("treats a first reading as everything so far", () => {
    expect(cacheDelta(null, stats({ misses: 7, hits: 3 })).bakes).toBe(7);
  });
});

describe("hud lines", () => {
  const pacing = { samples: 120, avgMs: 16.7, p95Ms: 17.1, maxMs: 24.5, fps: 59.88 };
  const cost = { samples: 120, avgMs: 2.14, p95Ms: 4.8, maxMs: 9.1, fps: 467 };

  it("leads with the figures the target is written in", () => {
    const counters = createRenderCounters();
    counters.draws = 640;
    counters.groundDrawn = 190;
    counters.groundCulled = 18;
    counters.objectsDrawn = 67;
    counters.objectsCulled = 10;
    counters.glowsDrawn = 288;
    counters.glowsCulled = 13;
    const lines = perfHudLines(pacing, cost, counters, null);
    // fps and the p95 come off the wall clock between frames, not off
    // the JS the frame spent — a scene can be cheap and still stutter.
    expect(lines[0]).toContain("59.9");
    expect(lines[0]).toContain("p95 17.10ms");
    expect(lines[1]).toContain("2.14ms avg");
    expect(lines[2]).toContain("640");
    expect(lines[3]).toContain("190/208");
    // No cache reading, no cache line.
    expect(lines).toHaveLength(4);
  });

  it("adds the bake line when a cache is being watched", () => {
    const lines = perfHudLines(pacing, cost, createRenderCounters(), {
      bakes: 0,
      hits: 900,
      evictions: 0,
      entries: 310,
      bytes: 4 * 1024 * 1024,
    });
    expect(lines).toHaveLength(5);
    expect(lines[4]).toContain("bakes  0");
    expect(lines[4]).toContain("4.0MiB");
    expect(lines[4]).not.toContain("evicted");
  });

  it("calls out evictions, which mean the budget is being hit", () => {
    const lines = perfHudLines(pacing, cost, createRenderCounters(), {
      bakes: 12,
      hits: 4,
      evictions: 7,
      entries: 2,
      bytes: 0,
    });
    expect(lines[4]).toContain("evicted 7");
  });
});
