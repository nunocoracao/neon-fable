import { describe, expect, it } from "vitest";
import {
  TILE_H,
  TILE_W,
  screenToTile,
  screenToWorld,
  tileDistance,
  worldToScreen,
} from "./coords";

describe("worldToScreen", () => {
  it("places the origin tile at screen (0, 0)", () => {
    expect(worldToScreen(0, 0)).toEqual({ sx: 0, sy: 0 });
  });

  it("moves +x east-down and +y west-down in 2:1 ratio", () => {
    expect(worldToScreen(1, 0)).toEqual({ sx: TILE_W / 2, sy: TILE_H / 2 });
    expect(worldToScreen(0, 1)).toEqual({ sx: -TILE_W / 2, sy: TILE_H / 2 });
    expect(worldToScreen(1, 1)).toEqual({ sx: 0, sy: TILE_H });
  });
});

describe("screenToWorld", () => {
  it("is the exact inverse of worldToScreen", () => {
    for (const [x, y] of [
      [0, 0],
      [3, 7],
      [-2, 5],
      [10.5, 0.25],
    ] as const) {
      const { sx, sy } = worldToScreen(x, y);
      const world = screenToWorld(sx, sy);
      expect(world.x).toBeCloseTo(x, 10);
      expect(world.y).toBeCloseTo(y, 10);
    }
  });
});

describe("screenToTile", () => {
  it("round-trips every tile center on a grid", () => {
    for (let x = -3; x <= 6; x++) {
      for (let y = -3; y <= 6; y++) {
        const { sx, sy } = worldToScreen(x, y);
        expect(screenToTile(sx, sy)).toEqual({ x, y });
      }
    }
  });

  it("hits the tile anywhere inside its diamond, not its bounding box", () => {
    const { sx, sy } = worldToScreen(2, 2);
    // Just inside the west corner of tile (2, 2)
    expect(screenToTile(sx - TILE_W / 2 + 2, sy)).toEqual({ x: 2, y: 2 });
    // Just inside the north corner
    expect(screenToTile(sx, sy - TILE_H / 2 + 1)).toEqual({ x: 2, y: 2 });
    // A bounding-box corner lies outside the diamond → different tile.
    expect(screenToTile(sx - TILE_W / 2 + 2, sy - TILE_H / 2 + 1)).not.toEqual({
      x: 2,
      y: 2,
    });
  });

  it("assigns points past a diamond edge to the neighboring tile", () => {
    const { sx, sy } = worldToScreen(0, 0);
    // Step east past the east corner: neighbor is (1, 0) side.
    const east = screenToTile(sx + TILE_W / 2 + 2, sy + 1);
    expect(east).not.toEqual({ x: 0, y: 0 });
  });
});

describe("tileDistance", () => {
  it("is the Manhattan distance", () => {
    expect(tileDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(tileDistance({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
  });
});
