// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpriteCacheStats } from "../iso/art/spriteCache";
import { createRenderCounters, type ScenePerfSample } from "../iso/perf";
import { PERF_HUD_UPDATE_MS, createPerfHud } from "./perfHud";

function sample(frameMs: number, deltaMs: number): ScenePerfSample {
  const counters = createRenderCounters();
  counters.draws = 640;
  counters.groundDrawn = 190;
  counters.groundCulled = 18;
  return { frameMs, deltaMs, counters };
}

let host: HTMLElement;
let now = 0;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.restoreAllMocks();
  host.remove();
});

function panel(): HTMLElement | null {
  return host.querySelector(".nf-perf-hud");
}

describe("the dev frame-time HUD", () => {
  it("puts an inert panel in its host and takes it away again", () => {
    const hud = createPerfHud({ host });
    expect(panel()).not.toBeNull();
    // It reports on the scene; it never stands in front of it.
    expect(panel()?.getAttribute("aria-hidden")).toBe("true");
    hud.destroy();
    expect(panel()).toBeNull();
  });

  it("shows the pacing, the cost, and what the frame drew", () => {
    const hud = createPerfHud({ host });
    hud.sample(sample(4, 16.7));
    const text = panel()?.textContent ?? "";
    expect(text).toContain("fps");
    expect(text).toContain("cpu    4.00ms avg");
    expect(text).toContain("draws  640");
    expect(text).toContain("190/208");
  });

  it("reports fps off the wall clock, not off the work", () => {
    const hud = createPerfHud({ host });
    // A cheap frame that is nonetheless arriving at 30fps: the honest
    // answer is 30, and a HUD deriving it from `frameMs` would say 500.
    for (let i = 0; i < 10; i++) {
      now += PERF_HUD_UPDATE_MS;
      hud.sample(sample(2, 33.3));
    }
    expect(panel()?.textContent ?? "").toContain("fps    30.0");
  });

  it("writes the DOM on a throttle while keeping every frame", () => {
    const hud = createPerfHud({ host, updateMs: 100 });
    hud.sample(sample(4, 16));
    const first = panel()?.textContent ?? "";
    now += 50;
    // Inside the throttle: a wildly different frame changes nothing yet.
    hud.sample(sample(90, 90));
    expect(panel()?.textContent).toBe(first);
    now += 60;
    hud.sample(sample(90, 90));
    expect(panel()?.textContent).not.toBe(first);
    // ...but the throttled samples were still counted: three frames in,
    // two of them 90ms, so the worst case is the hitch, not the 16.
    expect(panel()?.textContent ?? "").toContain("worst 90.00ms");
  });

  it("counts bakes since the last paint, so a warmed scene reads zero", () => {
    let misses = 12;
    const stats = (): SpriteCacheStats => ({
      entries: 300,
      bytes: 2 * 1024 * 1024,
      budgetBytes: 64 * 1024 * 1024,
      hits: 9000,
      misses,
      evictions: 0,
    });
    const hud = createPerfHud({ host, updateMs: 0, cacheStats: stats });
    // First paint: everything baked so far.
    hud.sample(sample(4, 16));
    expect(panel()?.textContent ?? "").toContain("bakes  12");
    now += 1;
    misses = 15;
    hud.sample(sample(4, 16));
    expect(panel()?.textContent ?? "").toContain("bakes  3");
    now += 1;
    hud.sample(sample(4, 16));
    expect(panel()?.textContent ?? "").toContain("bakes  0");
    hud.destroy();
  });

  it("clears back to an empty reading on reset", () => {
    const hud = createPerfHud({ host, updateMs: 0 });
    now += 1;
    hud.sample(sample(90, 90));
    expect(panel()?.textContent ?? "").toContain("worst 90.00ms");
    hud.reset();
    expect(panel()?.textContent ?? "").toContain("worst 0.00ms");
    expect(panel()?.textContent ?? "").toContain("draws  0");
  });

  it("holds the frame it reported, not a record that has moved on", () => {
    const hud = createPerfHud({ host, updateMs: 0 });
    // The scene reuses one counter record and zeroes it per frame; the
    // HUD must have copied what it painted.
    const live = sample(4, 16);
    now += 1;
    hud.sample(live);
    live.counters.draws = 0;
    live.counters.groundDrawn = 0;
    expect(panel()?.textContent ?? "").toContain("draws  640");
  });
});
