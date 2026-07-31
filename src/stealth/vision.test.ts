import { describe, expect, it } from "vitest";
import { buildMapGrid, type IsoMap, type LegendEntry } from "../iso/tilemap";
import {
  blocksSight,
  coneTiles,
  earshotTiles,
  hasLineOfSight,
  sightLine,
  visionTiles,
} from "./vision";

/**
 * A little room to look across: open floor, a wall down the middle with
 * a doorway in it, a crate, and a pane of glass.
 *
 *      0123456
 *   0  #######
 *   1  #..#..#
 *   2  #.....#      row 2 is the doorway through the wall
 *   3  #..#..#
 *   4  #.c#g.#      c = crate (opaque), g = glass (transparent)
 *   5  #######
 */
const legend: Record<string, LegendEntry> = {
  "#": { tile: "foundation" },
  ".": { tile: "pavement" },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
  g: { tile: "pavement", prop: { propId: "glass-partition-x", blocks: true } },
};

const rows = ["#######", "#..#..#", "#.....#", "#..#..#", "#.c#g.#", "#######"];

function room(): IsoMap {
  const grid = buildMapGrid(legend, rows);
  return {
    id: "vision-room",
    name: "Vision Room",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles,
    props: grid.props,
    interactables: [],
    spawns: [{ id: "player-start", x: 1, y: 1 }],
  };
}

describe("cone geometry", () => {
  it("opens from the tile ahead, one lateral tile per tile of depth", () => {
    const cone = coneTiles({ x: 5, y: 5 }, "e", { range: 3, spread: 1 });
    expect(cone).toEqual([
      // depth 1: the tile directly ahead, and nothing beside it
      { x: 6, y: 5 },
      // depth 2: one either side
      { x: 7, y: 4 },
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      // depth 3: two either side
      { x: 8, y: 3 },
      { x: 8, y: 4 },
      { x: 8, y: 5 },
      { x: 8, y: 6 },
      { x: 8, y: 7 },
    ]);
  });

  it("keeps a corridor's straight line at spread 0", () => {
    expect(coneTiles({ x: 2, y: 6 }, "n", { range: 4, spread: 0 })).toEqual([
      { x: 2, y: 5 },
      { x: 2, y: 4 },
      { x: 2, y: 3 },
      { x: 2, y: 2 },
    ]);
  });

  it("carries exactly `range` tiles of depth, and never the origin", () => {
    for (const range of [0, 1, 2, 5]) {
      const cone = coneTiles({ x: 4, y: 4 }, "w", { range, spread: 1 });
      const depths = new Set(cone.map((tile) => 4 - tile.x));
      expect([...depths].sort((a, b) => a - b)).toEqual(
        [...Array(range).keys()].map((i) => i + 1),
      );
      expect(cone).not.toContainEqual({ x: 4, y: 4 });
    }
  });

  it("points every facing the way it is named", () => {
    const at = { x: 3, y: 3 };
    const spec = { range: 2, spread: 0 };
    expect(coneTiles(at, "n", spec)).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 1 },
    ]);
    expect(coneTiles(at, "s", spec)).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]);
    expect(coneTiles(at, "e", spec)).toEqual([
      { x: 4, y: 3 },
      { x: 5, y: 3 },
    ]);
    expect(coneTiles(at, "w", spec)).toEqual([
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ]);
  });

  it("is a pure function of its arguments", () => {
    const once = coneTiles({ x: 2, y: 2 }, "s", { range: 4, spread: 1 });
    const twice = coneTiles({ x: 2, y: 2 }, "s", { range: 4, spread: 1 });
    expect(twice).toEqual(once);
  });
});

describe("what stops a line of sight", () => {
  const map = room();

  it("counts walls, blocking props, and everything off the map", () => {
    expect(blocksSight(map, 3, 1)).toBe(true); // wall segment
    expect(blocksSight(map, 2, 4)).toBe(true); // crate
    expect(blocksSight(map, 2, 2)).toBe(false); // open floor
    expect(blocksSight(map, -1, 2)).toBe(true);
    expect(blocksSight(map, 99, 99)).toBe(true);
  });

  it("lets a pane of glass through — the one thing you see but can't walk", () => {
    expect(blocksSight(map, 4, 4)).toBe(false);
  });

  it("reports only the tiles strictly between two tiles", () => {
    expect(sightLine({ x: 1, y: 2 }, { x: 5, y: 2 })).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
    expect(sightLine({ x: 1, y: 1 }, { x: 2, y: 1 })).toEqual([]);
    expect(sightLine({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([]);
  });

  it("sees through the doorway and not through the wall beside it", () => {
    expect(hasLineOfSight(map, { x: 1, y: 2 }, { x: 5, y: 2 })).toBe(true);
    expect(hasLineOfSight(map, { x: 1, y: 1 }, { x: 5, y: 1 })).toBe(false);
    expect(hasLineOfSight(map, { x: 1, y: 3 }, { x: 5, y: 3 })).toBe(false);
  });
});

describe("what a guard actually holds", () => {
  const map = room();

  it("cuts the cone back to what the walls leave of it", () => {
    // Standing in the west room looking east along the doorway row: the
    // cone reaches all the way through, because row 2 is open.
    const through = visionTiles(map, { x: 1, y: 2 }, "e", {
      range: 4,
      spread: 0,
    });
    expect(through).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
      { x: 5, y: 2 },
    ]);
    // One row up, the wall stops it dead after a single tile.
    const stopped = visionTiles(map, { x: 1, y: 1 }, "e", {
      range: 4,
      spread: 0,
    });
    expect(stopped).toEqual([{ x: 2, y: 1 }]);
  });

  it("holds the tile a pane of glass stands on, and the one behind it", () => {
    const seen = visionTiles(map, { x: 5, y: 4 }, "w", { range: 3, spread: 0 });
    expect(seen).toContainEqual({ x: 4, y: 4 });
  });

  it("never holds a tile off the map, or the guard's own", () => {
    const seen = visionTiles(map, { x: 1, y: 1 }, "n", { range: 3, spread: 1 });
    expect(seen).toEqual([]);
    expect(
      visionTiles(map, { x: 2, y: 2 }, "e", { range: 2, spread: 1 }),
    ).not.toContainEqual({ x: 2, y: 2 });
  });
});

describe("earshot", () => {
  it("is the guard's own tile and the four around it", () => {
    expect(earshotTiles({ x: 4, y: 7 })).toEqual([
      { x: 4, y: 7 },
      { x: 5, y: 7 },
      { x: 3, y: 7 },
      { x: 4, y: 8 },
      { x: 4, y: 6 },
    ]);
  });
});
