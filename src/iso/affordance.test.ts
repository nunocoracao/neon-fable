import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTLINE_PALETTE,
  INTERACT_RANGE,
  OUTLINE_COLORS,
  focusInteractable,
  interactablesInRange,
  nearestInteractable,
  outlineColor,
} from "./affordance";
import { buildMapGrid, type Interactable, type IsoMap } from "./tilemap";

/**
 * What lights up, and why. The rules under test are the ones the player
 * feels: one thing at a time, the nearest wins, ties always break the
 * same way, and only declared interactables are ever candidates.
 */

const legend = { ".": { tile: "pavement" as const } };
const grid = buildMapGrid(
  legend,
  Array.from({ length: 10 }, () => ".".repeat(10)),
);

function thing(id: string, x: number, y: number): Interactable {
  return {
    id,
    x,
    y,
    label: id,
    spriteId: "terminal",
    interaction: { kind: "dialogue", nodeId: `${id}-node` },
  };
}

function mapWith(interactables: Interactable[]): IsoMap {
  return {
    id: "test",
    name: "Test",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles.map((row) => [...row]),
    props: [
      // Scenery, and plenty of it: none of it is a candidate for
      // anything, because only interactables ever are.
      { propId: "crate", x: 5, y: 5, blocks: true },
      { propId: "hydrant", x: 5, y: 4, blocks: true },
    ],
    interactables,
    spawns: [{ id: "player-start", x: 0, y: 0 }],
    ambient: { count: 4, zones: [{ id: "plaza", x: 0, y: 0, width: 10, height: 10 }] },
  };
}

describe("interactablesInRange", () => {
  it("takes everything within reach and leaves the rest", () => {
    const map = mapWith([
      thing("north", 5, 4),
      thing("east", 6, 5),
      thing("far", 8, 5),
    ]);
    expect(interactablesInRange(map, { x: 5, y: 5 }).map((i) => i.id)).toEqual([
      "north",
      "east",
    ]);
  });

  it("reaches exactly one tile — a diagonal neighbour is two away", () => {
    const map = mapWith([thing("corner", 6, 6)]);
    expect(interactablesInRange(map, { x: 5, y: 5 })).toEqual([]);
    expect(INTERACT_RANGE).toBe(1);
  });

  it("orders by distance first when the range is widened", () => {
    const map = mapWith([thing("far", 5, 8), thing("near", 5, 6)]);
    expect(
      interactablesInRange(map, { x: 5, y: 5 }, 4).map((i) => i.id),
    ).toEqual(["near", "far"]);
  });

  it("finds nothing on a map that declares nothing", () => {
    expect(interactablesInRange(mapWith([]), { x: 5, y: 5 })).toEqual([]);
  });
});

describe("nearestInteractable", () => {
  it("breaks ties the same way whatever order the map lists them in", () => {
    // All four neighbours of (5, 5), equidistant: north wins on y,
    // and the order they were authored in changes nothing.
    const ring = [
      thing("north", 5, 4),
      thing("west", 4, 5),
      thing("east", 6, 5),
      thing("south", 5, 6),
    ];
    const forwards = nearestInteractable(mapWith(ring), { x: 5, y: 5 });
    const backwards = nearestInteractable(mapWith([...ring].reverse()), {
      x: 5,
      y: 5,
    });
    expect(forwards?.id).toBe("north");
    expect(backwards?.id).toBe("north");
  });

  it("breaks a same-tile-row tie west first, then by id", () => {
    const map = mapWith([thing("east", 6, 5), thing("west", 4, 5)]);
    expect(nearestInteractable(map, { x: 5, y: 5 })?.id).toBe("west");

    // Two things on one tile is not authored, but the answer is still
    // fixed rather than order-dependent.
    const stacked = mapWith([thing("zeta", 5, 4), thing("alpha", 5, 4)]);
    expect(nearestInteractable(stacked, { x: 5, y: 5 })?.id).toBe("alpha");
  });

  it("is null with nothing in reach", () => {
    expect(nearestInteractable(mapWith([thing("far", 9, 9)]), { x: 0, y: 0 }))
      .toBeNull();
  });
});

describe("focusInteractable", () => {
  const map = mapWith([thing("kiosk", 5, 4), thing("vault", 9, 9)]);

  it("prefers what the cursor is on, at any distance", () => {
    const focus = focusInteractable(map, {
      playerTile: { x: 5, y: 5 },
      hoverTile: { x: 9, y: 9 },
    });
    expect(focus).toEqual({
      interactable: map.interactables[1],
      reason: "hover",
      distance: 8,
      inRange: false,
    });
  });

  it("falls back to the nearest thing in reach", () => {
    const focus = focusInteractable(map, {
      playerTile: { x: 5, y: 5 },
      hoverTile: { x: 0, y: 0 },
    });
    expect(focus).toEqual({
      interactable: map.interactables[0],
      reason: "nearby",
      distance: 1,
      inRange: true,
    });
  });

  it("reports a hovered thing that is also in reach as in reach", () => {
    const focus = focusInteractable(map, {
      playerTile: { x: 5, y: 5 },
      hoverTile: { x: 5, y: 4 },
    });
    expect(focus?.reason).toBe("hover");
    expect(focus?.inRange).toBe(true);
  });

  it("never picks scenery, a pedestrian's tile, or empty ground", () => {
    // (5, 5) holds a crate and the crowd walks the whole map; hovering
    // either finds nothing, and standing among them offers nothing.
    expect(
      focusInteractable(map, {
        playerTile: { x: 0, y: 0 },
        hoverTile: { x: 5, y: 5 },
      }),
    ).toBeNull();
    expect(
      focusInteractable(map, { playerTile: { x: 0, y: 0 }, hoverTile: null }),
    ).toBeNull();
  });

  it("treats an absent cursor the same as one over nothing", () => {
    const query = { playerTile: { x: 5, y: 5 } };
    expect(focusInteractable(map, query)?.interactable.id).toBe("kiosk");
  });
});

describe("outlineColor", () => {
  it("falls back to the default palette for anything unknown", () => {
    const fallback = OUTLINE_COLORS[DEFAULT_OUTLINE_PALETTE];
    expect(outlineColor()).toBe(fallback);
    expect(outlineColor(null)).toBe(fallback);
    expect(outlineColor("no-such-palette")).toBe(fallback);
    expect(outlineColor(DEFAULT_OUTLINE_PALETTE)).toBe(fallback);
  });

  it("gives every palette a colour of its own", () => {
    const colors = Object.values(OUTLINE_COLORS);
    expect(colors.length).toBeGreaterThan(1);
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("answers for the colourblind-assist palette", () => {
    expect(outlineColor("assist")).toBe(OUTLINE_COLORS.assist);
    expect(outlineColor("assist")).not.toBe(OUTLINE_COLORS.neon);
  });
});
