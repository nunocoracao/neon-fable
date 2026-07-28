import { describe, expect, it } from "vitest";
import { ZOOM_LEVELS } from "../settings";
import { ART_SCALE } from "./art/pixel";
import {
  cameraTranslation,
  clampCamera,
  mapPixelBounds,
  snapToPixelGrid,
  viewportToWorld,
  worldToViewport,
  type Camera,
} from "./camera";
import { TILE_H, TILE_W, screenToTile, worldToScreen } from "./coords";
import { buildMapGrid, type IsoMap } from "./tilemap";

function makeMap(width: number, height: number): IsoMap {
  const rows = Array.from({ length: height }, () => ".".repeat(width));
  const grid = buildMapGrid({ ".": { tile: "pavement" } }, rows);
  return {
    id: "test-map",
    name: "Test Map",
    width,
    height,
    tiles: grid.tiles,
    props: [],
    interactables: [],
    spawns: [],
  };
}

describe("mapPixelBounds", () => {
  it("spans the full diamond footprint of the map", () => {
    const bounds = mapPixelBounds(makeMap(4, 3));
    // West corner of tile (0, 2), east corner of tile (3, 0).
    expect(bounds.minX).toBe(-2 * (TILE_W / 2) - TILE_W / 2);
    expect(bounds.maxX).toBe(3 * (TILE_W / 2) + TILE_W / 2);
    // North corner of (0, 0), south corner of (3, 2).
    expect(bounds.minY).toBe(-TILE_H / 2);
    expect(bounds.maxY).toBe(5 * (TILE_H / 2) + TILE_H / 2);
  });
});

describe("clampCamera", () => {
  const bounds = { minX: -400, maxX: 400, minY: 0, maxY: 600 };

  it("leaves an in-bounds camera unchanged", () => {
    const cam = clampCamera({ sx: 0, sy: 300 }, bounds, 200, 200, 0);
    expect(cam).toEqual({ sx: 0, sy: 300 });
  });

  it("clamps so the viewport never leaves the bounds", () => {
    const cam = clampCamera({ sx: 9999, sy: -9999 }, bounds, 200, 200, 0);
    expect(cam.sx).toBe(400 - 100);
    expect(cam.sy).toBe(0 + 100);
  });

  it("centers an axis where the map is smaller than the viewport", () => {
    const cam = clampCamera({ sx: 350, sy: 300 }, bounds, 2000, 200, 0);
    expect(cam.sx).toBe(0); // midpoint of minX..maxX
    expect(cam.sy).toBe(300);
  });

  it("extends the pannable area by the margin", () => {
    const noMargin = clampCamera({ sx: 9999, sy: 300 }, bounds, 200, 200, 0);
    const withMargin = clampCamera({ sx: 9999, sy: 300 }, bounds, 200, 200, 50);
    expect(withMargin.sx).toBe(noMargin.sx + 50);
  });
});

describe("zoom levels", () => {
  it("cannot slice an art pixel: every level × ART_SCALE is an integer", () => {
    for (const level of ZOOM_LEVELS) {
      expect(Number.isInteger(level * ART_SCALE)).toBe(true);
    }
  });
});

describe("snapToPixelGrid", () => {
  it("lands every value on a whole device pixel", () => {
    for (const scale of [1, 1.5, 2, 3, 4]) {
      for (const value of [0, 0.24, 12.5, -7.31, 1023.874]) {
        const snapped = snapToPixelGrid(value, scale);
        expect(snapped * scale).toBeCloseTo(Math.round(snapped * scale), 9);
        expect(Math.abs(snapped - value)).toBeLessThanOrEqual(0.5 / scale + 1e-9);
      }
    }
  });
});

describe("cameraTranslation", () => {
  it("snaps the translation to whole device pixels at every dpr/zoom", () => {
    const camera: Camera = { sx: 123.37, sy: -41.9 };
    for (const dpr of [1, 1.5, 2, 3]) {
      for (const zoom of ZOOM_LEVELS) {
        const { tx, ty } = cameraTranslation(camera, 977, 613, zoom, dpr);
        const scale = dpr * zoom;
        expect(tx * scale).toBeCloseTo(Math.round(tx * scale), 9);
        expect(ty * scale).toBeCloseTo(Math.round(ty * scale), 9);
      }
    }
  });

  it("keeps the camera point within half a device pixel of center", () => {
    const camera: Camera = { sx: 250.2, sy: 90.6 };
    const { tx, ty } = cameraTranslation(camera, 800, 600, 2, 2);
    // Unsnapped center would be viewport/(2*zoom) - camera.
    expect(Math.abs(tx - (200 - camera.sx))).toBeLessThanOrEqual(1 / 8);
    expect(Math.abs(ty - (150 - camera.sy))).toBeLessThanOrEqual(1 / 8);
  });
});

describe("zoom-aware picking", () => {
  const viewportW = 801;
  const viewportH = 599;

  it("viewportToWorld and worldToViewport are inverses at every zoom", () => {
    const camera: Camera = { sx: 310.5, sy: -42.25 };
    for (const zoom of ZOOM_LEVELS) {
      for (const [cssX, cssY] of [[0, 0], [400.5, 299.5], [801, 599], [13, 501]]) {
        const world = viewportToWorld(
          camera, viewportW, viewportH, zoom, cssX ?? 0, cssY ?? 0,
        );
        const back = worldToViewport(
          camera, viewportW, viewportH, zoom, world.sx, world.sy,
        );
        expect(back.x).toBeCloseTo(cssX ?? 0, 9);
        expect(back.y).toBeCloseTo(cssY ?? 0, 9);
      }
    }
  });

  it("the viewport center is exactly the camera point", () => {
    const camera: Camera = { sx: 77, sy: 191 };
    for (const zoom of ZOOM_LEVELS) {
      const world = viewportToWorld(
        camera, viewportW, viewportH, zoom, viewportW / 2, viewportH / 2,
      );
      expect(world).toEqual({ sx: 77, sy: 191 });
    }
  });

  it("picks the tile whose center was projected to the viewport", () => {
    // Project each tile center into CSS pixels, pick it back, and expect
    // the same tile — the round-trip the scene's pickTile performs.
    const camera: Camera = { sx: 128.6, sy: 64.4 };
    for (const zoom of ZOOM_LEVELS) {
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          const center = worldToScreen(x, y);
          const css = worldToViewport(
            camera, viewportW, viewportH, zoom, center.sx, center.sy,
          );
          const world = viewportToWorld(
            camera, viewportW, viewportH, zoom, css.x, css.y,
          );
          const tile = screenToTile(world.sx, world.sy);
          // + 0 folds Math.round's -0 into +0 for the deep equal.
          expect({ x: tile.x + 0, y: tile.y + 0 }).toEqual({ x, y });
        }
      }
    }
  });
});
