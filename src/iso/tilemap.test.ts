import { describe, expect, it } from "vitest";
import {
  buildMapGrid,
  inBounds,
  interactableAt,
  isWalkable,
  neighbors,
  requireSpawn,
  tileAt,
  type IsoMap,
  type LegendEntry,
} from "./tilemap";

const legend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  "~": { tile: "canal" },
  l: { tile: "pavement", prop: { propId: "streetlight", blocks: true } },
};

function makeMap(rows: string[]): IsoMap {
  const grid = buildMapGrid(legend, rows);
  return {
    id: "test-map",
    name: "Test Map",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles,
    props: grid.props,
    interactables: [],
    spawns: [{ id: "player", x: 0, y: 0 }],
  };
}

describe("buildMapGrid", () => {
  it("expands legend rows into tiles and props", () => {
    const grid = buildMapGrid(legend, [".l", "~."]);
    expect(grid.width).toBe(2);
    expect(grid.height).toBe(2);
    expect(grid.tiles).toEqual([
      ["pavement", "pavement"],
      ["canal", "pavement"],
    ]);
    expect(grid.props).toEqual([{ propId: "streetlight", x: 1, y: 0, blocks: true }]);
  });

  it("throws on ragged rows", () => {
    expect(() => buildMapGrid(legend, ["..", "."])).toThrow(/length/);
  });

  it("throws on characters missing from the legend", () => {
    expect(() => buildMapGrid(legend, [".x"])).toThrow(/legend/);
  });
});

describe("walkability", () => {
  it("rejects out-of-bounds, unwalkable tiles, and blocking props", () => {
    const map = makeMap([".l", "~."]);
    expect(isWalkable(map, 0, 0)).toBe(true);
    expect(isWalkable(map, 1, 1)).toBe(true);
    expect(isWalkable(map, -1, 0)).toBe(false);
    expect(isWalkable(map, 2, 0)).toBe(false);
    expect(isWalkable(map, 0, 1)).toBe(false); // canal
    expect(isWalkable(map, 1, 0)).toBe(false); // streetlight prop
  });

  it("treats interactable tiles as blocked", () => {
    const map = makeMap(["..", ".."]);
    map.interactables.push({
      id: "npc",
      x: 1,
      y: 1,
      label: "NPC",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "start" },
    });
    expect(isWalkable(map, 1, 1)).toBe(false);
    expect(interactableAt(map, 1, 1)?.id).toBe("npc");
    expect(interactableAt(map, 0, 0)).toBeUndefined();
  });
});

describe("queries", () => {
  it("tileAt and inBounds agree at the edges", () => {
    const map = makeMap([".l", "~."]);
    expect(inBounds(map, 1, 1)).toBe(true);
    expect(inBounds(map, 2, 1)).toBe(false);
    expect(tileAt(map, 0, 1)?.id).toBe("canal");
    expect(tileAt(map, 5, 5)).toBeUndefined();
  });

  it("requireSpawn returns the spawn or throws", () => {
    const map = makeMap(["..", ".."]);
    expect(requireSpawn(map, "player")).toEqual({ id: "player", x: 0, y: 0 });
    expect(() => requireSpawn(map, "missing")).toThrow(/spawn/);
  });

  it("neighbors returns the 4-neighborhood", () => {
    expect(neighbors({ x: 2, y: 3 })).toEqual([
      { x: 3, y: 3 },
      { x: 1, y: 3 },
      { x: 2, y: 4 },
      { x: 2, y: 2 },
    ]);
  });
});
