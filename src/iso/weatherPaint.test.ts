// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireMap } from "../data/maps";
import { createPixelArtSprites } from "./art/provider";
import { mapPixelBounds } from "./camera";
import { renderScene, type RenderView } from "./render";
import { RAIN_LAYERS, rainStreaks, resolveWeather } from "./weather";

/**
 * The weather pass through the real renderer, with a recording 2d
 * context: what is under test is the wiring — that a rainy map actually
 * puts more on the screen, that a clear one (or the settings toggle)
 * puts nothing extra there, and that the frozen clock reduced motion
 * passes leaves the picture identical frame to frame. The pixels
 * themselves are the art tests' business.
 */
interface DrawRecord {
  images: number;
  alphas: number[];
}

function recordingContext(record: DrawRecord): CanvasRenderingContext2D {
  const noop = (): void => {};
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    canvas: { width: 0, height: 0 },
    setTransform: noop,
    clearRect: noop,
    fillRect: noop,
    drawImage: (): void => {
      record.images++;
      record.alphas.push(ctx.globalAlpha as number);
    },
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    createRadialGradient: () => ({ addColorStop: noop }),
    arc: noop,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext({ images: 0, alphas: [] }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const map = requireMap("greywater-steps");
const bounds = mapPixelBounds(map);
const sprites = createPixelArtSprites();

function draw(
  weather: RenderView["weather"],
  timeMs: number,
): DrawRecord {
  const record: DrawRecord = { images: 0, alphas: [] };
  const view: RenderView = {
    map,
    camera: { sx: bounds.minX + 200, sy: bounds.minY + 200 },
    viewportW: 960,
    viewportH: 600,
    hoverTile: null,
    path: [],
    entities: [],
    timeMs,
    dpr: 2,
    zoom: 1,
    glowEnabled: true,
    weather,
  };
  renderScene(recordingContext(record), sprites, view);
  return record;
}

describe("weather in the scene render", () => {
  it("draws the rain the map declares, and nothing extra without it", () => {
    const rain = resolveWeather(map, { enabled: true });
    expect(rain).not.toBeNull();
    const wet = draw(rain, 2000);
    const dry = draw(null, 2000);
    expect(wet.images).toBeGreaterThan(dry.images);
    // The extra draws are the two streak curtains plus any splashes.
    const streaks = RAIN_LAYERS.reduce(
      (n, layer, i) => n + rainStreaks(layer, i, 2000, 960, 600, 1).length,
      0,
    );
    expect(wet.images - dry.images).toBeGreaterThanOrEqual(streaks);
    // Streaks draw at partial alpha; the ground pass never does.
    expect(wet.alphas.some((a) => a > 0 && a < 1)).toBe(true);
  });

  it("draws nothing extra when the weather setting is off", () => {
    expect(resolveWeather(map, { enabled: false })).toBeNull();
    expect(draw(resolveWeather(map, { enabled: false }), 2000).images).toBe(
      draw(null, 2000).images,
    );
  });

  it("paints an identical picture on the frozen reduced-motion clock", () => {
    const rain = resolveWeather(map, { enabled: true });
    // Scenes pass timeMs 0 under reduced motion; two frames of that
    // must be the same picture — the rain hangs still.
    const first = draw(rain, 0);
    const second = draw(rain, 0);
    expect(second.images).toBe(first.images);
    expect(second.alphas).toEqual(first.alphas);
    // ...while a running clock moves it.
    expect(draw(rain, 400).alphas).not.toEqual(first.alphas);
  });

  it("thins the curtain down in an arena without emptying it", () => {
    const arena = requireMap("pumpworks-arena");
    const inherited = resolveWeather(arena, {
      enabled: true,
      weather: "rain",
      arena: true,
    });
    const full = RAIN_LAYERS.reduce(
      (n, layer, i) => n + rainStreaks(layer, i, 1500, 960, 600, 1).length,
      0,
    );
    const thinned = RAIN_LAYERS.reduce(
      (n, layer, i) =>
        n + rainStreaks(layer, i, 1500, 960, 600, inherited?.density ?? 1).length,
      0,
    );
    expect(thinned).toBeGreaterThan(0);
    expect(thinned).toBeLessThan(full);
  });
});
