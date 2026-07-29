import { describe, expect, it } from "vitest";
import {
  ENTRY_SPAWN_ID,
  INTERIOR_FLOOR_IDS,
  TRIM_EDGES,
  buildMapGrid,
  entryFacing,
  inBounds,
  interactableAt,
  isWalkable,
  mapExits,
  neighbors,
  requireSpawn,
  tileAt,
  tileMaterial,
  type Interactable,
  type IsoMap,
  type LegendEntry,
  type SpawnPoint,
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

describe("tileMaterial", () => {
  it("folds every interior trim into its own floor material", () => {
    for (const floor of INTERIOR_FLOOR_IDS) {
      expect(tileMaterial(floor)).toBe(floor);
      for (const edge of TRIM_EDGES) {
        expect(tileMaterial(`${floor}-${edge}`), `${floor}-${edge}`).toBe(floor);
      }
    }
  });

  it("folds quay lips into pavement and both canals into water", () => {
    for (const edge of TRIM_EDGES) {
      expect(tileMaterial(`quay-${edge}`), `quay-${edge}`).toBe("pavement");
    }
    expect(tileMaterial("pavement")).toBe("pavement");
    expect(tileMaterial("canal")).toBe("water");
    expect(tileMaterial("canal-deep")).toBe("water");
  });

  it("keeps visually distinct surfaces apart", () => {
    const distinct = [
      "pavement",
      "pavement-cracked",
      "plaza-glow",
      "road",
      "rust-floor",
      "foundation",
    ] as const;
    const materials = distinct.map(tileMaterial);
    expect(new Set(materials).size).toBe(distinct.length);
  });
});

/**
 * Arrivals. Every spawn sits at a threshold — a stair head, a tram
 * arch, the road below a plaza — so the useful default is to turn
 * whoever lands on it toward the space they just entered. Authored
 * facings win, for the thresholds the shape of the map gets wrong.
 */
describe("entryFacing", () => {
  const wide = makeMap(Array.from({ length: 9 }, () => ".".repeat(9)));

  function spawn(x: number, y: number, facing?: SpawnPoint["facing"]): SpawnPoint {
    return { id: "entry", x, y, facing };
  }

  it("turns an arrival in from whichever edge it landed on", () => {
    expect(entryFacing(wide, spawn(4, 8))).toBe("n");
    expect(entryFacing(wide, spawn(4, 0))).toBe("s");
    expect(entryFacing(wide, spawn(0, 4))).toBe("e");
    expect(entryFacing(wide, spawn(8, 4))).toBe("w");
  });

  it("prefers an authored facing over the derived one", () => {
    // Bottom edge: the shape says look north, the author says east.
    expect(entryFacing(wide, spawn(4, 8, "e"))).toBe("e");
    expect(entryFacing(wide, spawn(4, 8, "s"))).toBe("s");
  });

  it("falls back to facing the camera dead-center on the map", () => {
    expect(entryFacing(wide, spawn(4, 4))).toBe("s");
  });

  it("names the spawn every map is expected to carry", () => {
    expect(ENTRY_SPAWN_ID).toBe("player-start");
  });
});

describe("mapExits", () => {
  const door: Interactable = {
    id: "door",
    x: 1,
    y: 0,
    label: "Side Door",
    spriteId: "door",
    interaction: { kind: "dialogue", nodeId: "n" },
    exit: { mapId: "elsewhere" },
  };
  const kiosk: Interactable = {
    id: "kiosk",
    x: 0,
    y: 1,
    label: "Kiosk",
    spriteId: "terminal",
    interaction: { kind: "dialogue", nodeId: "n" },
  };

  it("picks out only the interactables that lead off the map", () => {
    const map = { ...makeMap(["..", ".."]), interactables: [kiosk, door] };
    expect(mapExits(map).map((i) => i.id)).toEqual(["door"]);
    expect(mapExits({ ...map, interactables: [kiosk] })).toEqual([]);
  });
});
