import { describe, expect, it } from "vitest";
import { flickerOn, hash2, propFrameAt } from "./animation";
import { GLOW_FALLOFF, hexToRgba } from "./art/glow";
import { INTERACTABLE_ART } from "./art/interactables";
import { ART_SCALE } from "./art/pixel";
import { PROP_ART } from "./art/props";
import { TILE_ART } from "./art/tiles";
import {
  REFLECTION_ALPHA,
  REFLECTION_RADIUS_FACTOR,
  REFLECTION_RANGE,
  REFLECTION_SINK,
  collectGlowPlacements,
  glowLitAtFrame,
  type GlowPlacement,
} from "./glowPass";
import { glowIntensityScale } from "./dayPhase";
import {
  DAY_PHASES,
  DEFAULT_DAY_PHASE,
  type DayPhaseId,
  type Interactable,
  type IsoMap,
  type PropPlacement,
  type TileId,
} from "./tilemap";
import { SHIMMER_PERIOD_MS, shimmerFactor, tileKey } from "./weather";

function makeMap(
  overrides: Partial<IsoMap> & { width: number; height: number },
): IsoMap {
  const tiles: TileId[][] = Array.from({ length: overrides.height }, () =>
    Array.from({ length: overrides.width }, () => "pavement" as TileId),
  );
  return {
    id: "test",
    name: "Test",
    tiles,
    props: [],
    interactables: [],
    spawns: [],
    ...overrides,
  };
}

function prop(propId: PropPlacement["propId"], x: number, y: number): PropPlacement {
  return { propId, x, y, blocks: true };
}

function interactable(
  spriteId: Interactable["spriteId"],
  x: number,
  y: number,
): Interactable {
  return {
    id: `i-${x}-${y}`,
    x,
    y,
    label: "Test",
    spriteId,
    interaction: { kind: "dialogue", nodeId: "n" },
  };
}

/** A time (ms) where the flicker at this placement's seed is on/off. */
function flickerTime(x: number, y: number, on: boolean): number {
  const seed = hash2(x, y);
  for (let slot = 0; slot < 1000; slot++) {
    const t = slot * 90 + 45;
    if (flickerOn(t, seed) === on) return t;
  }
  throw new Error("no matching flicker slot found");
}

describe("glowLitAtFrame", () => {
  it("keeps non-flicker glows lit on every frame", () => {
    expect(glowLitAtFrame(3, false, 0)).toBe(true);
    expect(glowLitAtFrame(3, false, 2)).toBe(true);
  });

  it("kills flicker glows only on the reserved dropout frame", () => {
    expect(glowLitAtFrame(4, true, 0)).toBe(true);
    expect(glowLitAtFrame(4, true, 2)).toBe(true);
    expect(glowLitAtFrame(4, true, 3)).toBe(false);
  });
});

describe("collectGlowPlacements", () => {
  it("emits every authored source of a glowing prop with scaled offsets", () => {
    const map = makeMap({ width: 5, height: 5, props: [prop("streetlight", 2, 3)] });
    const t = flickerTime(2, 3, true);
    const placements = collectGlowPlacements(map, t);
    const sources = PROP_ART.streetlight.glow ?? [];
    expect(sources.length).toBeGreaterThan(0);
    expect(placements.length).toBe(sources.length);
    sources.forEach((source, i) => {
      expect(placements[i]).toEqual({
        x: 2,
        y: 3,
        offsetX: source.offsetX * ART_SCALE,
        offsetY: source.offsetY * ART_SCALE,
        color: source.color,
        radius: source.radius,
        alpha: source.intensity,
      });
    });
  });

  it("props without glow metadata emit nothing", () => {
    const map = makeMap({ width: 3, height: 3, props: [prop("crate", 1, 1)] });
    expect(collectGlowPlacements(map, 0)).toEqual([]);
  });

  it("flickering props go dark with their dropout frame", () => {
    const map = makeMap({ width: 5, height: 5, props: [prop("neon-sign", 1, 1)] });
    expect(collectGlowPlacements(map, flickerTime(1, 1, true)).length).toBe(1);
    expect(collectGlowPlacements(map, flickerTime(1, 1, false))).toEqual([]);
    // The glow choice agrees with the sprite frame the provider shows.
    const art = PROP_ART["neon-sign"];
    const offFrame = propFrameAt(
      art.frames.length,
      art.frameMs,
      art.flicker,
      1,
      1,
      flickerTime(1, 1, false),
    );
    expect(offFrame).toBe(art.frames.length - 1);
  });

  it("non-flicker animated props stay lit across their whole loop", () => {
    const map = makeMap({ width: 5, height: 5, props: [prop("vent-stack", 2, 2)] });
    for (let t = 0; t < 3000; t += 100) {
      expect(collectGlowPlacements(map, t).length, `t=${t}`).toBe(1);
    }
  });

  it("interactables glow steadily; npc resolves through characters and casts none", () => {
    const map = makeMap({
      width: 5,
      height: 5,
      interactables: [interactable("terminal", 1, 2), interactable("npc", 3, 3)],
    });
    const placements = collectGlowPlacements(map, 0);
    const source = (INTERACTABLE_ART.terminal.glow ?? [])[0];
    expect(placements).toEqual([
      {
        x: 1,
        y: 2,
        offsetX: (source?.offsetX ?? 0) * ART_SCALE,
        offsetY: (source?.offsetY ?? 0) * ART_SCALE,
        color: source?.color,
        radius: source?.radius,
        alpha: source?.intensity,
      },
    ]);
  });

  it("glowing tiles emit one placement per map tile of that kind", () => {
    const map = makeMap({ width: 3, height: 3 });
    map.tiles[0]![0] = "plaza-glow";
    map.tiles[2]![1] = "plaza-glow";
    const placements = collectGlowPlacements(map, 0);
    expect(placements.length).toBe(2);
    expect(placements.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [1, 2],
    ]);
    const source = (TILE_ART["plaza-glow"].glow ?? [])[0];
    expect(placements[0]?.color).toBe(source?.color);
    expect(placements[0]?.alpha).toBe(source?.intensity);
  });

  it("reflective water near an object glow receives a faint sunken copy", () => {
    const map = makeMap({ width: 6, height: 3, props: [prop("neon-sign", 1, 1)] });
    map.tiles[1]![2] = "canal"; // distance 1
    map.tiles[1]![3] = "canal-deep"; // distance 2
    map.tiles[1]![5] = "canal"; // distance 4: out of range
    const t = flickerTime(1, 1, true);
    const placements = collectGlowPlacements(map, t);
    const source = (PROP_ART["neon-sign"].glow ?? [])[0]!;
    const reflections = placements.filter((p) => p.x !== 1 || p.y !== 1);
    expect(reflections.length).toBe(2);
    const near = reflections.find((p) => p.x === 2) as GlowPlacement;
    const far = reflections.find((p) => p.x === 3) as GlowPlacement;
    expect(near).toEqual({
      x: 2,
      y: 1,
      offsetX: 0,
      offsetY: REFLECTION_SINK * ART_SCALE,
      color: source.color,
      radius: Math.round(source.radius * REFLECTION_RADIUS_FACTOR),
      alpha: source.intensity * (REFLECTION_ALPHA[1] ?? 0),
    });
    expect(far.alpha).toBe(source.intensity * (REFLECTION_ALPHA[2] ?? 0));
    expect(far.alpha).toBeLessThan(near.alpha);
  });

  it("reflections die with their flickering source", () => {
    const map = makeMap({ width: 4, height: 3, props: [prop("neon-sign", 1, 1)] });
    map.tiles[1]![2] = "canal";
    expect(collectGlowPlacements(map, flickerTime(1, 1, false))).toEqual([]);
  });

  it("dry pavement never reflects", () => {
    const map = makeMap({ width: 4, height: 3, props: [prop("shop-sign", 1, 1)] });
    const t = flickerTime(1, 1, true);
    const placements = collectGlowPlacements(map, t);
    expect(placements.length).toBe(1);
    expect(placements[0]?.x).toBe(1);
  });

  it("puddles reflect while it rains, and only the ones the map pooled", () => {
    // Rain makes wet ground behave exactly like canal water in the
    // glow pass — same machinery, one more reflective surface.
    const map = makeMap({ width: 5, height: 3, props: [prop("shop-sign", 1, 1)] });
    const t = flickerTime(1, 1, true);
    const dry = collectGlowPlacements(map, t);
    expect(dry.length).toBe(1);

    const weather = { puddles: new Set([tileKey(2, 1)]) };
    const wet = collectGlowPlacements(map, t, weather);
    const reflections = wet.filter((p) => p.x !== 1 || p.y !== 1);
    expect(reflections.length).toBe(1);
    const source = (PROP_ART["shop-sign"].glow ?? [])[0]!;
    const reflection = reflections[0] as GlowPlacement;
    expect(reflection.x).toBe(2);
    expect(reflection.offsetY).toBe(REFLECTION_SINK * ART_SCALE);
    expect(reflection.radius).toBe(
      Math.round(source.radius * REFLECTION_RADIUS_FACTOR),
    );
    // Alpha is the dry reflection alpha, shimmering.
    const flat = source.intensity * (REFLECTION_ALPHA[1] ?? 0);
    expect(reflection.alpha).toBeCloseTo(flat * shimmerFactor(2, 1, t), 9);
  });

  it("shimmers wet reflections around their flat alpha as time runs", () => {
    const map = makeMap({ width: 5, height: 3, props: [prop("shop-sign", 1, 1)] });
    const weather = { puddles: new Set([tileKey(2, 1)]) };
    const alphas: number[] = [];
    for (let t = 0; t < SHIMMER_PERIOD_MS; t += 100) {
      // Sample only lit moments; the flicker dropout is tested above.
      const placements = collectGlowPlacements(map, flickerTime(1, 1, true) + t, weather);
      const reflection = placements.find((p) => p.x === 2);
      if (reflection) alphas.push(reflection.alpha);
    }
    expect(alphas.length).toBeGreaterThan(4);
    const low = Math.min(...alphas);
    const high = Math.max(...alphas);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(0);
  });

  it("leaves the glow pass exactly as it was when the sky is clear", () => {
    const map = makeMap({ width: 5, height: 3, props: [prop("shop-sign", 1, 1)] });
    map.tiles[1]![2] = "canal";
    const t = flickerTime(1, 1, true);
    expect(collectGlowPlacements(map, t, null)).toEqual(
      collectGlowPlacements(map, t),
    );
  });

  it("reflection constants stay a cheap accent: faint, shrunken, short-range", () => {
    expect(REFLECTION_RANGE).toBeLessThanOrEqual(3);
    expect(REFLECTION_RADIUS_FACTOR).toBeLessThan(1);
    for (const factor of REFLECTION_ALPHA.slice(1)) {
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(0.5);
    }
    expect(REFLECTION_ALPHA[0]).toBe(0);
  });
});

describe("the hour on the glow pass", () => {
  const map = makeMap({
    width: 5,
    height: 5,
    props: [prop("streetlight", 2, 3)],
    interactables: [interactable("terminal", 1, 1)],
  });

  it("leaves the default hour exactly as authored", () => {
    const t = flickerTime(2, 3, true);
    expect(collectGlowPlacements(map, t, null, DEFAULT_DAY_PHASE)).toEqual(
      collectGlowPlacements(map, t),
    );
  });

  it("scales every alpha by the phase, and nothing else", () => {
    const t = flickerTime(2, 3, true);
    const night = collectGlowPlacements(map, t);
    for (const phase of DAY_PHASES) {
      const staged = collectGlowPlacements(map, t, null, phase);
      const scale = glowIntensityScale(phase);
      expect(staged.length, phase).toBe(night.length);
      staged.forEach((placement, i) => {
        const base = night[i] as GlowPlacement;
        expect(placement.alpha, `${phase} alpha ${i}`).toBeCloseTo(
          Math.min(1, base.alpha * scale),
        );
        // Placement, color, and radius are authored; the hour never
        // moves a light or repaints it.
        expect({ ...placement, alpha: 0 }, `${phase} placement ${i}`).toEqual({
          ...base,
          alpha: 0,
        });
      });
    }
  });

  it("burns the neon harder in the small hours than at dusk", () => {
    const t = flickerTime(2, 3, true);
    const alphaAt = (phase: DayPhaseId): number =>
      collectGlowPlacements(map, t, null, phase).reduce(
        (sum, g) => sum + g.alpha,
        0,
      );
    expect(alphaAt("late")).toBeGreaterThan(alphaAt("night"));
    expect(alphaAt("night")).toBeGreaterThan(alphaAt("dusk"));
  });

  it("never drives an alpha out of range", () => {
    const t = flickerTime(2, 3, true);
    for (const phase of DAY_PHASES) {
      for (const glow of collectGlowPlacements(map, t, null, phase)) {
        expect(glow.alpha, phase).toBeGreaterThan(0);
        expect(glow.alpha, phase).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("glow falloff", () => {
  it("fades monotonically to fully transparent at the rim", () => {
    const alphas = GLOW_FALLOFF.map(([, alpha]) => alpha);
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeLessThan(alphas[i - 1] ?? 0);
    }
    expect(GLOW_FALLOFF[0]?.[0]).toBe(0);
    expect(GLOW_FALLOFF[GLOW_FALLOFF.length - 1]).toEqual([1, 0]);
    // Soft center: additive stacking must not white out characters.
    expect(GLOW_FALLOFF[0]?.[1]).toBeLessThanOrEqual(0.7);
  });

  it("hexToRgba converts palette hex entries", () => {
    expect(hexToRgba("#2ee6d6", 0.5)).toBe("rgba(46, 230, 214, 0.5)");
    expect(hexToRgba("#05060c", 1)).toBe("rgba(5, 6, 12, 1)");
  });
});
