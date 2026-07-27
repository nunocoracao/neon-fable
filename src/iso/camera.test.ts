import { describe, expect, it } from "vitest";
import { clampCamera, mapPixelBounds } from "./camera";
import { TILE_H, TILE_W } from "./coords";
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
