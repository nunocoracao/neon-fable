import { describe, expect, it } from "vitest";
import { minimapCells } from "./minimap";
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
  propBlocksTile,
  propTiles,
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

/**
 * Set pieces too big for one diamond — a beached hull, a gantry — are
 * placed on the tile nearest the viewer and declare the tiles their
 * bulk reaches back over. What matters is that the bulk is solid: the
 * whole footprint blocks, not just the tile the prop was written on.
 */
describe("props with a footprint", () => {
  const beached = (blocks: boolean): IsoMap => {
    const map = makeMap(["....", "....", "...."]);
    map.props.push({
      propId: "crate",
      x: 3,
      y: 2,
      blocks,
      footprint: [
        { x: -1, y: 0 },
        { x: 0, y: -1 },
        { x: -1, y: -1 },
      ],
    });
    return map;
  };

  it("blocks every tile the bulk lies across, not just its own", () => {
    const map = beached(true);
    for (const [x, y] of [
      [3, 2],
      [2, 2],
      [3, 1],
      [2, 1],
    ] as const) {
      expect(isWalkable(map, x, y), `(${x}, ${y})`).toBe(false);
    }
    // And nothing beyond it: the tiles alongside stay open ground.
    expect(isWalkable(map, 1, 2)).toBe(true);
    expect(isWalkable(map, 3, 0)).toBe(true);
  });

  it("blocks nothing at all when the prop is scenery to walk through", () => {
    const map = beached(false);
    expect(propBlocksTile(map, 2, 1)).toBe(false);
    expect(isWalkable(map, 2, 1)).toBe(true);
  });

  it("reads as blocked ground on the minimap wherever the bulk lands", () => {
    const cells = minimapCells(beached(true));
    expect(cells[1]?.[2]).toBe("blocked");
    expect(cells[2]?.[3]).toBe("blocked");
    expect(cells[2]?.[1]).toBe("walkable");
  });

  it("lists its own tile first, then the tiles it reaches back over", () => {
    const [prop] = beached(true).props;
    if (!prop) throw new Error("no prop");
    expect(propTiles(prop)).toEqual([
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
      { x: 2, y: 1 },
    ]);
    // A plain prop covers exactly the tile it stands on.
    expect(propTiles({ propId: "crate", x: 4, y: 5, blocks: true })).toEqual([
      { x: 4, y: 5 },
    ]);
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
