// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maps, requireMap } from "../data/maps";
import { ambientSpriteSource } from "../ui/entitySprites";
import {
  MAX_AMBIENT_PER_MAP,
  createCrowd,
  crowdEntities,
  stepCrowd,
} from "./ambient";
import { createPixelArtSprites } from "./art/provider";
import { mapPixelBounds } from "./camera";
import { renderScene, type RenderView } from "./render";
import { tileMaterial } from "./tilemap";
import { resolveWeather } from "./weather";

/**
 * Frame-cost guard for the busiest map in the game (the Vertical
 * Market, with its full ambient crowd walking — the densest street
 * authored, at the per-map pedestrian cap). Draw calls are stubbed to
 * nothing, so what is measured is the JS a frame actually owns:
 * stepping every pedestrian, building and depth-sorting the drawable
 * list, and the provider's per-sprite cache lookups — the work that
 * grows with crowd size. The whole run also proves the bake cache does
 * its job: a warmed scene must resolve entity sprites out of cache, so
 * a crowd costs lookups, not re-bakes.
 *
 * A warmed frame lands around 0.2ms on a dev machine against a 16.6ms
 * budget at 60fps; the ceiling here leaves room for slow CI while
 * still catching an order-of-magnitude regression (a per-frame
 * recompose, a cache key that never hits, an O(n^2) crowd step).
 */
const FRAMES = 120;
const FRAME_BUDGET_MS = 4;

/** Every 2d-context member the ground, highlight, and object passes use. */
function stubContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return {
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
    drawImage: noop,
    save: noop,
    restore: noop,
    translate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    stroke: noop,
    // The glow pass bakes radial gradients; happy-dom has no canvas.
    createRadialGradient: () => ({ addColorStop: noop }),
    arc: noop,
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
    stubContext(),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("crowded-scene frame budget", () => {
  const map = requireMap("vertical-market");

  it("renders the market's full crowd well inside a 60fps frame", () => {
    // Pin the choice of map: this bench is only meaningful on whichever
    // district carries the most pedestrians.
    expect(map.ambient?.count).toBe(MAX_AMBIENT_PER_MAP);
    const sprites = createPixelArtSprites({ entity: ambientSpriteSource() });
    const ctx = stubContext();
    const bounds = mapPixelBounds(map);

    const runFrames = (startCrowd: ReturnType<typeof createCrowd>): void => {
      let crowd = startCrowd;
      for (let frame = 0; frame < FRAMES; frame++) {
        const timeMs = frame * (1000 / 60);
        crowd = stepCrowd(crowd, map, 1 / 60);
        const view: RenderView = {
          map,
          camera: { sx: bounds.minX + 200, sy: bounds.minY + 200 },
          viewportW: 1280,
          viewportH: 720,
          hoverTile: { x: 5, y: 5 },
          path: [],
          entities: [
            {
              spriteId: "player",
              position: { x: 7, y: 9 },
              facing: "s",
              moving: true,
            },
            ...crowdEntities(crowd),
          ],
          timeMs,
          dpr: 2,
          zoom: 1,
          glowEnabled: true,
        };
        renderScene(ctx, sprites, view);
      }
    };

    // Warm-up run: the first pass pays every bake and JIT cost, exactly
    // like a scene's opening seconds. The measured run is steady state.
    runFrames(createCrowd(map));
    const warmed = sprites.cacheStats();

    const start = performance.now();
    runFrames(createCrowd(map));
    const elapsed = performance.now() - start;

    const perFrame = elapsed / FRAMES;
    expect(perFrame, `${perFrame.toFixed(3)}ms per frame`).toBeLessThan(
      FRAME_BUDGET_MS,
    );

    // Steady state must be nearly all cache hits: a crowd that re-baked
    // its sprites every frame would blow the budget on a slower machine
    // long before this assertion, so pin the cause, not just the symptom.
    const steady = sprites.cacheStats();
    const misses = steady.misses - warmed.misses;
    const hits = steady.hits - warmed.hits;
    expect(hits).toBeGreaterThan(0);
    expect(misses / (hits + misses)).toBeLessThan(0.05);
    expect(steady.evictions).toBe(0);
  });

  it("keeps a rainy frame on open water inside the same budget", () => {
    // Rain adds a few hundred streak draws and a handful of splashes on
    // top of everything above, all resolved from the same bake cache
    // (two streak sprites, three splash frames). If weather ever starts
    // baking per frame, this is where it shows up.
    //
    // Measured on the quays because they are the worst case for the wet
    // path: the most open water in the game, so the glow pass reflects
    // off more tiles here than anywhere else, and the district stands a
    // six-tile wrecked hull in the middle of it.
    const rainy = requireMap("flooded-quays");
    expect(rainy.weather).toBe("rain");
    const openWater = (map: typeof rainy): number =>
      map.tiles.flat().filter((id) => tileMaterial(id) === "water").length;
    for (const map of maps) {
      if (map.id === rainy.id) continue;
      expect(openWater(rainy), `${map.id} is wetter`).toBeGreaterThan(
        openWater(map),
      );
    }
    const weather = resolveWeather(rainy, { enabled: true });
    const sprites = createPixelArtSprites({ entity: ambientSpriteSource() });
    const ctx = stubContext();
    const rainBounds = mapPixelBounds(rainy);

    const runRainFrames = (): void => {
      let crowd = createCrowd(rainy);
      for (let frame = 0; frame < FRAMES; frame++) {
        crowd = stepCrowd(crowd, rainy, 1 / 60);
        renderScene(ctx, sprites, {
          map: rainy,
          camera: { sx: rainBounds.minX + 200, sy: rainBounds.minY + 200 },
          viewportW: 1280,
          viewportH: 720,
          hoverTile: { x: 5, y: 5 },
          path: [],
          entities: crowdEntities(crowd),
          timeMs: frame * (1000 / 60),
          dpr: 2,
          zoom: 1,
          glowEnabled: true,
          weather,
        });
      }
    };

    runRainFrames();
    const warmed = sprites.cacheStats();
    const start = performance.now();
    runRainFrames();
    const perFrame = (performance.now() - start) / FRAMES;
    expect(perFrame, `${perFrame.toFixed(3)}ms per rainy frame`).toBeLessThan(
      FRAME_BUDGET_MS,
    );
    expect(sprites.cacheStats().misses - warmed.misses).toBe(0);
  });

  it("bakes one canvas per look and pose, not per pedestrian", () => {
    const sprites = createPixelArtSprites({ entity: ambientSpriteSource() });
    const crowd = createCrowd(map);
    const pose = { facing: "s" as const, moving: false, timeMs: 0 };

    // Two pedestrians who share a look share the baked frame outright;
    // asking twice for one pedestrian's frame never bakes twice.
    const before = sprites.cacheStats().entries;
    for (const ped of crowd.pedestrians) {
      sprites.entity(`ambient:${ped.lookSeed}`, pose);
      sprites.entity(`ambient:${ped.lookSeed}`, pose);
    }
    const baked = sprites.cacheStats().entries - before;
    expect(baked).toBeLessThanOrEqual(crowd.pedestrians.length);
    expect(sprites.cacheStats().hits).toBeGreaterThanOrEqual(
      crowd.pedestrians.length,
    );
  });
});
