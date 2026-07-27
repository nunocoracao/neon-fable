import { describe, expect, it } from "vitest";
import { findPath, findPathToAdjacent } from "./path";
import { buildMapGrid, isWalkable, type IsoMap, type LegendEntry } from "./tilemap";

const legend: Record<string, LegendEntry> = {
  ".": { tile: "pavement" },
  "#": { tile: "foundation" },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
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
    spawns: [],
  };
}

describe("findPath", () => {
  it("finds the straight shortest path on open ground", () => {
    const map = makeMap(["....", "....", "...."]);
    const path = findPath(map, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("returns [start] when start equals goal", () => {
    const map = makeMap(["..", ".."]);
    expect(findPath(map, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });

  it("routes around unwalkable tiles and blocking props", () => {
    const map = makeMap([
      ".#.",
      ".c.",
      "...",
    ]);
    const path = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path).not.toBeNull();
    // Must detour through the open bottom row: 6 steps + start.
    expect(path).toHaveLength(7);
    for (const step of path ?? []) {
      if (step.x === 0 && step.y === 0) continue;
      expect(isWalkable(map, step.x, step.y)).toBe(true);
    }
    // Consecutive steps are 4-adjacent.
    for (let i = 1; i < (path?.length ?? 0); i++) {
      const a = path?.[i - 1];
      const b = path?.[i];
      expect(Math.abs((a?.x ?? 0) - (b?.x ?? 0)) + Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBe(1);
    }
  });

  it("returns null when the goal is unreachable", () => {
    const map = makeMap([
      ".#.",
      ".#.",
      ".#.",
    ]);
    expect(findPath(map, { x: 0, y: 1 }, { x: 2, y: 1 })).toBeNull();
  });

  it("returns null when the goal tile is not walkable", () => {
    const map = makeMap(["..", ".#"]);
    expect(findPath(map, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it("blocks tiles occupied by interactables", () => {
    const map = makeMap(["...", "...", "..."]);
    map.interactables.push({
      id: "npc",
      x: 1,
      y: 0,
      label: "NPC",
      spriteId: "npc",
      interaction: { kind: "dialogue", nodeId: "start" },
    });
    const path = findPath(map, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path).not.toBeNull();
    expect(path).toHaveLength(5);
    expect(path?.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });
});

describe("findPathToAdjacent", () => {
  it("returns [start] when already adjacent to the target", () => {
    const map = makeMap(["...", "..."]);
    expect(findPathToAdjacent(map, { x: 1, y: 0 }, { x: 2, y: 0 })).toEqual([
      { x: 1, y: 0 },
    ]);
  });

  it("walks to the nearest walkable tile next to the target", () => {
    const map = makeMap(["....", "....", "...."]);
    const path = findPathToAdjacent(map, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(path).not.toBeNull();
    // Shortest is stopping at (2, 0): start + 2 steps.
    expect(path).toHaveLength(3);
    const last = path?.[path.length - 1];
    expect(
      Math.abs((last?.x ?? 0) - 3) + Math.abs((last?.y ?? 0) - 0),
    ).toBe(1);
  });

  it("returns null when no adjacent tile is reachable", () => {
    const map = makeMap([
      "..#.",
      "..#.",
      "..#.",
    ]);
    // Target fully behind the wall, its west side blocked by the wall.
    expect(findPathToAdjacent(map, { x: 0, y: 0 }, { x: 3, y: 1 })).toBeNull();
  });
});
