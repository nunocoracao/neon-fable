import { describe, expect, it } from "vitest";
import { SPLASH_ART } from "./art/weather";
import { TILE_ART } from "./art/tiles";
import type { IsoMap, TileId } from "./tilemap";
import {
  ARENA_STREAK_DENSITY,
  PUDDLE_DENSITY,
  RAIN_LAYERS,
  SHIMMER_AMOUNT,
  SHIMMER_PERIOD_MS,
  SPLASH_FRAME_MS,
  SPLASH_PERIOD_MS,
  activeSplashes,
  layerFallPx,
  puddleAt,
  puddleTiles,
  rainStreaks,
  resolveWeather,
  shimmerFactor,
  splashFrameAt,
  tileHoldsWater,
  tileKey,
  wetTiles,
  type WeatherView,
} from "./weather";

function makeMap(rows: TileId[][], weather?: IsoMap["weather"]): IsoMap {
  return {
    id: "test",
    name: "Test",
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tiles: rows,
    props: [],
    interactables: [],
    spawns: [],
    ...(weather ? { weather } : {}),
  };
}

function filled(width: number, height: number, id: TileId): TileId[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => id),
  );
}

const rainyStreet = makeMap(filled(12, 10, "pavement"), "rain");

describe("wet ground eligibility", () => {
  it("takes water on outdoor ground and nowhere else", () => {
    // The flag is the presence of rain art on the tile kind, so this
    // agrees with what the provider can actually draw.
    for (const [id, art] of Object.entries(TILE_ART)) {
      expect(tileHoldsWater(id as TileId), id).toBe(art.wet !== undefined);
    }
    expect(tileHoldsWater("pavement")).toBe(true);
    expect(tileHoldsWater("road")).toBe(true);
    expect(tileHoldsWater("quay-n")).toBe(true);
    // Water is already water; interiors and wall bases are not ground
    // the sky can reach.
    expect(tileHoldsWater("canal")).toBe(false);
    expect(tileHoldsWater("bar-floor")).toBe(false);
    expect(tileHoldsWater("foundation")).toBe(false);
  });

  it("collects only eligible tiles, in row-major order", () => {
    const map = makeMap([
      ["pavement", "canal", "road"],
      ["bar-floor", "pavement", "foundation"],
    ]);
    expect(wetTiles(map)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});

describe("puddle placement", () => {
  it("is a pure function of the coordinate", () => {
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        expect(puddleAt(x, y)).toBe(puddleAt(x, y));
      }
    }
  });

  it("wets roughly the declared share of a large field", () => {
    let wet = 0;
    const side = 100;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        if (puddleAt(x, y)) wet++;
      }
    }
    const share = wet / (side * side);
    expect(share).toBeGreaterThan(PUDDLE_DENSITY - 0.06);
    expect(share).toBeLessThan(PUDDLE_DENSITY + 0.06);
  });

  it("puddles a subset of a map's wet ground, and always the same one", () => {
    const map = makeMap([
      ["pavement", "canal", "road"],
      ["bar-floor", "pavement", "pavement"],
    ]);
    const puddles = puddleTiles(map);
    const eligible = new Set(wetTiles(map).map((t) => tileKey(t.x, t.y)));
    for (const key of puddles) expect(eligible.has(key)).toBe(true);
    expect([...puddleTiles(map)]).toEqual([...puddles]);
  });
});

describe("resolveWeather", () => {
  it("gives clear maps no weather at all", () => {
    expect(resolveWeather(makeMap(filled(4, 4, "pavement")), { enabled: true }))
      .toBeNull();
    expect(
      resolveWeather(makeMap(filled(4, 4, "pavement"), "clear"), {
        enabled: true,
      }),
    ).toBeNull();
  });

  it("resolves a rainy map to puddles and splashable ground", () => {
    const view = resolveWeather(rainyStreet, { enabled: true });
    expect(view?.id).toBe("rain");
    expect(view?.density).toBe(1);
    expect(view?.puddles.size).toBeGreaterThan(0);
    expect(view?.splashTiles.length).toBe(12 * 10);
  });

  it("is switched off entirely by the settings toggle", () => {
    expect(resolveWeather(rainyStreet, { enabled: false })).toBeNull();
  });

  it("lets an arena inherit weather it has no sky for, thinned down", () => {
    const arena = makeMap(filled(8, 6, "rust-floor"));
    expect(resolveWeather(arena, { enabled: true })).toBeNull();
    const inherited = resolveWeather(arena, {
      enabled: true,
      weather: "rain",
      arena: true,
    });
    expect(inherited?.id).toBe("rain");
    expect(inherited?.density).toBe(ARENA_STREAK_DENSITY);
    expect(ARENA_STREAK_DENSITY).toBeLessThan(1);
  });

  it("lets an inherited clear sky override a rainy map", () => {
    expect(
      resolveWeather(rainyStreet, { enabled: true, weather: "clear" }),
    ).toBeNull();
  });
});

describe("rain streaks", () => {
  const layer = RAIN_LAYERS[0]!;

  it("falls at the layer's speed", () => {
    expect(layerFallPx(layer, 0)).toBe(0);
    expect(layerFallPx(layer, 1000)).toBe(layer.speed);
    expect(layerFallPx(layer, 500)).toBeCloseTo(layer.speed / 2);
    // Negative clocks (never produced, but cheap to be safe about).
    expect(layerFallPx(layer, -400)).toBe(0);
  });

  it("is the same field every time for the same instant", () => {
    const a = rainStreaks(layer, 0, 4200, 640, 480);
    const b = rainStreaks(layer, 0, 4200, 640, 480);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("covers the viewport it is given", () => {
    const streaks = rainStreaks(layer, 0, 1234, 800, 600);
    for (const streak of streaks) {
      expect(streak.x).toBeGreaterThanOrEqual(-layer.spacingX);
      expect(streak.x).toBeLessThanOrEqual(800 + layer.spacingX);
      expect(streak.y).toBeGreaterThanOrEqual(-2 * layer.spacingY);
      expect(streak.y).toBeLessThanOrEqual(600 + 2 * layer.spacingY);
      expect(streak.alpha).toBeGreaterThan(0);
      expect(streak.alpha).toBeLessThanOrEqual(1);
    }
    // Both halves of the screen get rain — the field is not bunched.
    expect(streaks.some((s) => s.x < 400)).toBe(true);
    expect(streaks.some((s) => s.x >= 400)).toBe(true);
  });

  it("drifts downward as the clock advances", () => {
    // Within one lattice row the whole field simply slides down, which
    // is what makes the rain read as falling rather than flickering.
    const step = 20;
    const before = rainStreaks(layer, 0, 0, 400, 300);
    const after = rainStreaks(layer, 0, step, 400, 300);
    expect(after.length).toBe(before.length);
    const fall = layerFallPx(layer, step);
    expect(fall).toBeGreaterThan(0);
    after.forEach((streak, i) => {
      expect(streak.y - (before[i]?.y ?? 0)).toBeCloseTo(fall, 6);
    });
  });

  it("thins out with density, without changing where the rain is", () => {
    const full = rainStreaks(layer, 0, 900, 640, 480, 1);
    const thin = rainStreaks(layer, 0, 900, 640, 480, ARENA_STREAK_DENSITY);
    expect(thin.length).toBeLessThan(full.length);
    expect(thin.length).toBeGreaterThan(0);
    // The survivors are drops the full field also has: thinning drops
    // streaks, it does not reshuffle the curtain.
    const fullKeys = new Set(full.map((s) => `${s.x},${s.y}`));
    for (const streak of thin) {
      expect(fullKeys.has(`${streak.x},${streak.y}`)).toBe(true);
    }
    expect(rainStreaks(layer, 0, 900, 640, 480, 0)).toEqual([]);
  });

  it("draws nothing for an unmeasured viewport", () => {
    expect(rainStreaks(layer, 0, 100, 0, 480)).toEqual([]);
    expect(rainStreaks(layer, 0, 100, 640, 0)).toEqual([]);
  });

  it("stills completely on the frozen clock reduced motion passes", () => {
    // Scenes freeze timeMs at 0 for reduced motion; the curtain then
    // hangs in place instead of falling.
    expect(rainStreaks(layer, 0, 0, 640, 480)).toEqual(
      rainStreaks(layer, 0, 0, 640, 480),
    );
  });

  it("gives each parallax layer its own field", () => {
    const far = rainStreaks(RAIN_LAYERS[0]!, 0, 3000, 640, 480);
    const near = rainStreaks(RAIN_LAYERS[1]!, 1, 3000, 640, 480);
    expect(far.length).not.toBe(near.length);
  });
});

describe("splashes", () => {
  const frameCount = SPLASH_ART.length;

  it("runs a tile's splash through its frames and then stops", () => {
    // Find a tile whose window fires, then walk its micro-frames.
    let found: { x: number; y: number; start: number } | null = null;
    for (let x = 0; x < 40 && !found; x++) {
      for (let y = 0; y < 40 && !found; y++) {
        for (let t = 0; t < SPLASH_PERIOD_MS; t += SPLASH_FRAME_MS) {
          if (splashFrameAt(x, y, t, frameCount) === 0) {
            found = { x, y, start: t };
            break;
          }
        }
      }
    }
    expect(found).not.toBeNull();
    const { x, y, start } = found!;
    for (let frame = 0; frame < frameCount; frame++) {
      expect(splashFrameAt(x, y, start + frame * SPLASH_FRAME_MS, frameCount))
        .toBe(frame);
    }
    expect(
      splashFrameAt(x, y, start + frameCount * SPLASH_FRAME_MS, frameCount),
    ).toBeNull();
  });

  it("is deterministic and occasional, never a continuous downpour", () => {
    const timeMs = 7777;
    let splashing = 0;
    const total = 40 * 40;
    for (let x = 0; x < 40; x++) {
      for (let y = 0; y < 40; y++) {
        expect(splashFrameAt(x, y, timeMs, frameCount)).toBe(
          splashFrameAt(x, y, timeMs, frameCount),
        );
        if (splashFrameAt(x, y, timeMs, frameCount) !== null) splashing++;
      }
    }
    // A splash lives a few frames out of a multi-second window, so only
    // a sliver of the ground is ever popping at once.
    expect(splashing).toBeGreaterThan(0);
    expect(splashing / total).toBeLessThan(0.1);
  });

  it("gives neighbouring tiles their own schedule", () => {
    // First moment each tile of a row splashes: a street should ripple
    // in scattered pops, never in unison.
    const firstSplash = Array.from({ length: 12 }, (_, x) => {
      for (let t = 0; t < 6 * SPLASH_PERIOD_MS; t += 30) {
        if (splashFrameAt(x, 3, t, frameCount) !== null) return t;
      }
      return null;
    }).filter((t): t is number => t !== null);
    expect(firstSplash.length).toBeGreaterThanOrEqual(10);
    expect(new Set(firstSplash).size).toBeGreaterThan(4);
  });

  it("never schedules a frame the art does not have", () => {
    for (let t = 0; t < 5000; t += 37) {
      const frame = splashFrameAt(5, 6, t, frameCount);
      if (frame === null) continue;
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(frameCount);
    }
    expect(splashFrameAt(5, 6, 100, 0)).toBeNull();
  });

  it("only pops on the weather view's own wet ground", () => {
    const view = resolveWeather(rainyStreet, { enabled: true }) as WeatherView;
    const ground = new Set(view.splashTiles.map((t) => tileKey(t.x, t.y)));
    for (const splash of activeSplashes(view, 3300, frameCount)) {
      expect(ground.has(tileKey(splash.x, splash.y))).toBe(true);
      expect(splash.frame).toBeLessThan(frameCount);
    }
  });
});

describe("reflection shimmer", () => {
  it("swings around 1 by the declared amount", () => {
    for (let t = 0; t < 4000; t += 53) {
      for (let x = 0; x < 5; x++) {
        const factor = shimmerFactor(x, x + 1, t);
        expect(factor).toBeGreaterThanOrEqual(1 - SHIMMER_AMOUNT - 1e-9);
        expect(factor).toBeLessThanOrEqual(1 + SHIMMER_AMOUNT + 1e-9);
      }
    }
  });

  it("repeats with its period and is stable at a given instant", () => {
    expect(shimmerFactor(2, 3, 400)).toBeCloseTo(
      shimmerFactor(2, 3, 400 + SHIMMER_PERIOD_MS),
      9,
    );
    expect(shimmerFactor(2, 3, 400)).toBe(shimmerFactor(2, 3, 400));
  });

  it("puts neighbouring tiles out of step", () => {
    const row = Array.from({ length: 8 }, (_, x) => shimmerFactor(x, 4, 250));
    expect(new Set(row.map((v) => v.toFixed(4))).size).toBeGreaterThan(1);
  });
});
