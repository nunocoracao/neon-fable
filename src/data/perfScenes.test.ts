import { describe, expect, it } from "vitest";
import { clampCamera, mapPixelBounds, type Camera } from "../iso/camera";
import { requireMap } from "./maps";
import { PERF_SCENES, panRect, perfScene, scrollCircuit } from "./perfScenes";

describe("perf scenes", () => {
  it("names a map and a spawn that exist", () => {
    for (const scene of PERF_SCENES) {
      const map = requireMap(scene.mapId);
      expect(
        map.spawns.some((spawn) => spawn.id === scene.spawnId),
        `${scene.id} spawn`,
      ).toBe(true);
    }
  });

  it("is the worst frame the game can make, not a comfortable one", () => {
    const scene = perfScene("worst-case");
    const map = requireMap(scene.mapId);
    // Every pass that costs anything, up.
    expect(scene.graphics.glow).toBe(true);
    expect(scene.graphics.weather).toBe(true);
    expect(scene.graphics.setPieces).toBe(true);
    // Reduced motion stills the crowd and the set pieces: a cheaper
    // frame, and so a dishonest one to measure against.
    expect(scene.graphics.motion).toBe("full");
    // The widest zoom shows the most map, which is the most draws.
    expect(scene.zoom).toBe(1);
    // Rain over a district that plays clear, and a district that has
    // both a crowd and machinery to run.
    expect(scene.weather).toBe("rain");
    expect(map.weather ?? "clear").not.toBe("rain");
    expect(map.ambient?.count ?? 0).toBeGreaterThan(0);
    expect(map.setPieces?.trains?.length ?? 0).toBeGreaterThan(0);
    // And it scrolls: a still camera measures an easier frame.
    expect(scene.scrollPxPerS).toBeGreaterThan(0);
  });

  it("refuses an id it does not have", () => {
    expect(() => perfScene("nope" as "worst-case")).toThrow(/Unknown perf scene/);
  });
});

describe("panRect", () => {
  const map = requireMap("cinder-plaza");
  const bounds = mapPixelBounds(map);
  const clampAt = (viewportW: number, viewportH: number) => (camera: Camera) =>
    clampCamera(camera, bounds, viewportW, viewportH);

  it("is the range a drag-pan could reach, both ends", () => {
    const clamp = clampAt(1280, 720);
    const { lo, hi } = panRect(clamp, bounds);
    expect(lo.sx).toBeLessThan(hi.sx);
    expect(lo.sy).toBeLessThan(hi.sy);
    // Both ends are fixed points of the clamp: panning cannot go past.
    expect(clamp(lo)).toEqual(lo);
    expect(clamp(hi)).toEqual(hi);
  });

  it("collapses to a point when the map is smaller than the viewport", () => {
    const { lo, hi } = panRect(clampAt(9000, 9000), bounds);
    expect(lo).toEqual(hi);
  });
});

describe("scrollCircuit", () => {
  const lo: Camera = { sx: -400, sy: -200 };
  const hi: Camera = { sx: 400, sy: 200 };
  const perimeter = 2 * (800 + 400);
  const speed = 240;

  it("starts at the corner it laps from and comes back to it", () => {
    expect(scrollCircuit(lo, hi, 0, speed)).toEqual(lo);
    const lapMs = (perimeter / speed) * 1000;
    const round = scrollCircuit(lo, hi, lapMs, speed);
    expect(round.sx).toBeCloseTo(lo.sx);
    expect(round.sy).toBeCloseTo(lo.sy);
  });

  it("never leaves the rectangle", () => {
    for (let ms = 0; ms < 40000; ms += 37) {
      const at = scrollCircuit(lo, hi, ms, speed);
      expect(at.sx).toBeGreaterThanOrEqual(lo.sx - 1e-9);
      expect(at.sx).toBeLessThanOrEqual(hi.sx + 1e-9);
      expect(at.sy).toBeGreaterThanOrEqual(lo.sy - 1e-9);
      expect(at.sy).toBeLessThanOrEqual(hi.sy + 1e-9);
    }
  });

  it("moves at the speed it was given, and never teleports", () => {
    // A jump would read on the HUD as a hitch that is not one, so the
    // step between adjacent frames has to stay the distance a frame
    // covers — corners included, where the direction turns.
    const stepMs = 1000 / 60;
    const expected = (speed * stepMs) / 1000;
    let previous = scrollCircuit(lo, hi, 0, speed);
    for (let frame = 1; frame < 600; frame++) {
      const at = scrollCircuit(lo, hi, frame * stepMs, speed);
      const moved = Math.hypot(at.sx - previous.sx, at.sy - previous.sy);
      expect(moved).toBeLessThanOrEqual(expected + 1e-6);
      previous = at;
    }
  });

  it("holds still where there is nowhere to scroll", () => {
    const point: Camera = { sx: 12, sy: 34 };
    expect(scrollCircuit(point, point, 5000, speed)).toEqual(point);
    expect(scrollCircuit(lo, hi, 5000, 0)).toEqual(lo);
  });

  it("laps the same way whatever the clock reads", () => {
    const lapMs = (perimeter / speed) * 1000;
    for (const ms of [0, 137, 4321, 9999]) {
      const now = scrollCircuit(lo, hi, ms, speed);
      const later = scrollCircuit(lo, hi, ms + lapMs * 3, speed);
      expect(later.sx).toBeCloseTo(now.sx);
      expect(later.sy).toBeCloseTo(now.sy);
    }
  });
});
