import { describe, expect, it } from "vitest";
import {
  MAX_AMBIENT_PER_MAP,
  ambientLookSeed,
  ambientSpriteId,
  createCrowd,
  crowdEntities,
  inZone,
  resolveZones,
  roamTiles,
  stepCrowd,
  stepPedestrian,
  type AmbientCrowd,
  type AmbientPedestrian,
} from "./ambient";
import { compareDrawables } from "./depth";
import { buildMapGrid, isWalkable, type IsoMap, type LegendEntry } from "./tilemap";

/**
 * A 6x6 open yard walled on the north edge, with one story NPC in the
 * middle so the trigger-ring rule has something to protect and one
 * blocking crate so pathing has something to route around.
 */
const legend: Record<string, LegendEntry> = {
  "#": { tile: "foundation", prop: { propId: "building", blocks: true } },
  ".": { tile: "pavement" },
  c: { tile: "pavement", prop: { propId: "crate", blocks: true } },
};

function makeMap(overrides: Partial<IsoMap> = {}): IsoMap {
  const grid = buildMapGrid(legend, [
    "######",
    "......",
    "..c...",
    "......",
    "......",
    "......",
  ]);
  return {
    id: "test-yard",
    name: "Test Yard",
    width: grid.width,
    height: grid.height,
    tiles: grid.tiles,
    props: grid.props,
    interactables: [
      {
        id: "story-npc",
        x: 3,
        y: 3,
        label: "Story NPC",
        spriteId: "npc",
        interaction: { kind: "dialogue", nodeId: "n" },
      },
    ],
    spawns: [{ id: "player-start", x: 1, y: 5 }],
    ambient: {
      count: 3,
      zones: [{ id: "yard", x: 1, y: 1, width: 4, height: 4 }],
    },
    ...overrides,
  };
}

/** Run a crowd for a number of fixed 1/60s frames. */
function run(crowd: AmbientCrowd, map: IsoMap, frames: number): AmbientCrowd {
  let next = crowd;
  for (let i = 0; i < frames; i++) next = stepCrowd(next, map, 1 / 60);
  return next;
}

describe("ambient sprite ids", () => {
  it("round-trips a look seed and rejects other entity ids", () => {
    expect(ambientLookSeed(ambientSpriteId(4242))).toBe(4242);
    expect(ambientLookSeed("player")).toBeNull();
    expect(ambientLookSeed("nme-rust-runner")).toBeNull();
    expect(ambientLookSeed("ambient:not-a-number")).toBeNull();
    expect(ambientLookSeed("ambient:-3")).toBeNull();
  });
});

describe("roamTiles", () => {
  const map = makeMap();

  it("keeps pedestrians off blocked tiles and story trigger rings", () => {
    const tiles = roamTiles(map, { id: "yard", x: 0, y: 0, width: 6, height: 6 });
    const keys = new Set(tiles.map((t) => `${t.x},${t.y}`));

    // Walls, the crate, and the NPC's own tile are not walkable at all.
    expect(keys.has("0,0")).toBe(false);
    expect(keys.has("2,2")).toBe(false);
    expect(keys.has("3,3")).toBe(false);
    // The four tiles the player interacts with the NPC from stay clear.
    for (const trigger of ["2,3", "4,3", "3,2", "3,4"]) {
      expect(keys.has(trigger)).toBe(false);
      const [x, y] = trigger.split(",").map(Number);
      expect(isWalkable(map, x ?? 0, y ?? 0)).toBe(true);
    }
    expect(keys.has("1,1")).toBe(true);
  });

  it("is stable in row-major order for a given map", () => {
    const zone = { id: "yard", x: 1, y: 1, width: 4, height: 4 };
    expect(roamTiles(map, zone)).toEqual(roamTiles(map, zone));
    const tiles = roamTiles(map, zone);
    const sorted = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(tiles).toEqual(sorted);
  });
});

describe("createCrowd", () => {
  it("seats pedestrians on distinct roamable tiles with stable looks", () => {
    const map = makeMap();
    const crowd = createCrowd(map);
    expect(crowd.pedestrians).toHaveLength(3);

    const roam = new Set(
      roamTiles(map, { id: "yard", x: 1, y: 1, width: 4, height: 4 }).map(
        (t) => `${t.x},${t.y}`,
      ),
    );
    const seats = crowd.pedestrians.map((p) => `${p.tile.x},${p.tile.y}`);
    expect(new Set(seats).size).toBe(seats.length);
    for (const seat of seats) expect(roam.has(seat)).toBe(true);
    for (const ped of crowd.pedestrians) {
      expect(ped.position).toEqual({ x: ped.tile.x, y: ped.tile.y });
      expect(ped.zoneId).toBe("yard");
    }
  });

  it("is fully deterministic: same map, same crowd", () => {
    expect(createCrowd(makeMap())).toEqual(createCrowd(makeMap()));
  });

  it("gives different maps different people", () => {
    const a = createCrowd(makeMap());
    const b = createCrowd(makeMap({ id: "other-yard" }));
    expect(a.pedestrians.map((p) => p.lookSeed)).not.toEqual(
      b.pedestrians.map((p) => p.lookSeed),
    );
  });

  it("spawns nothing for a map with no ambient spec", () => {
    const crowd = createCrowd(makeMap({ ambient: undefined }));
    expect(crowd.pedestrians).toEqual([]);
    expect(crowdEntities(crowd)).toEqual([]);
  });

  it("caps the crowd however greedy the data is", () => {
    const crowd = createCrowd(
      makeMap({
        // A wide-open map so tile supply is not what does the capping.
        interactables: [],
        ambient: {
          count: 500,
          zones: [{ id: "yard", x: 0, y: 1, width: 6, height: 5 }],
        },
      }),
    );
    expect(crowd.pedestrians.length).toBe(MAX_AMBIENT_PER_MAP);
  });

  it("deals pedestrians across zones round-robin", () => {
    const crowd = createCrowd(
      makeMap({
        interactables: [],
        ambient: {
          count: 4,
          zones: [
            { id: "north", x: 1, y: 1, width: 4, height: 2 },
            { id: "south", x: 1, y: 4, width: 4, height: 2 },
          ],
        },
      }),
    );
    expect(crowd.pedestrians.map((p) => p.zoneId)).toEqual([
      "north",
      "south",
      "north",
      "south",
    ]);
  });

  it("seats fewer people rather than stacking them in a cramped zone", () => {
    const crowd = createCrowd(
      makeMap({
        interactables: [],
        ambient: {
          count: 5,
          zones: [{ id: "nook", x: 1, y: 1, width: 2, height: 1 }],
        },
      }),
    );
    expect(crowd.pedestrians).toHaveLength(2);
  });
});

describe("stepCrowd", () => {
  const map = makeMap();

  it("replays identically from the same crowd", () => {
    expect(run(createCrowd(map), map, 900)).toEqual(
      run(createCrowd(map), map, 900),
    );
  });

  it("does not depend on the order pedestrians are updated in", () => {
    const crowd = createCrowd(map);
    const forward = run(crowd, map, 600).pedestrians;
    const reversed = run(
      { ...crowd, pedestrians: [...crowd.pedestrians].reverse() },
      map,
      600,
    ).pedestrians;
    expect([...reversed].reverse()).toEqual(forward);
  });

  it("walks pedestrians to reachable tiles and dwells between strolls", () => {
    let crowd = createCrowd(map);
    const start = crowd.pedestrians.map((p) => `${p.tile.x},${p.tile.y}`);
    let everWalked = false;
    let everIdled = false;
    for (let i = 0; i < 1800; i++) {
      crowd = stepCrowd(crowd, map, 1 / 60);
      if (crowd.pedestrians.some((p) => p.path.length > 0)) everWalked = true;
      if (crowd.pedestrians.every((p) => p.path.length === 0)) everIdled = true;
    }
    expect(everWalked).toBe(true);
    expect(everIdled).toBe(true);
    // Over half a minute of wandering, everyone has moved somewhere.
    expect(crowd.pedestrians.map((p) => `${p.tile.x},${p.tile.y}`)).not.toEqual(
      start,
    );
  });

  it("never leaves a pedestrian standing on an unwalkable or trigger tile", () => {
    let crowd = createCrowd(map);
    const triggers = new Set(["2,3", "4,3", "3,2", "3,4"]);
    for (let i = 0; i < 3600; i++) {
      crowd = stepCrowd(crowd, map, 1 / 60);
      for (const ped of crowd.pedestrians) {
        expect(isWalkable(map, ped.tile.x, ped.tile.y)).toBe(true);
        // Passing through a trigger tile is fine; stopping on one is not.
        if (ped.path.length === 0) {
          expect(triggers.has(`${ped.tile.x},${ped.tile.y}`)).toBe(false);
        }
      }
    }
  });

  it("keeps the drawn position on the segment between tile and next step", () => {
    let crowd = createCrowd(map);
    for (let i = 0; i < 1200; i++) {
      crowd = stepCrowd(crowd, map, 1 / 60);
      for (const ped of crowd.pedestrians) {
        expect(ped.progress).toBeGreaterThanOrEqual(0);
        expect(ped.progress).toBeLessThan(1);
        const next = ped.path[0] ?? ped.tile;
        expect(ped.position.x).toBeCloseTo(
          ped.tile.x + (next.x - ped.tile.x) * (ped.path.length > 0 ? ped.progress : 0),
          10,
        );
        expect(ped.position.y).toBeCloseTo(
          ped.tile.y + (next.y - ped.tile.y) * (ped.path.length > 0 ? ped.progress : 0),
          10,
        );
      }
    }
  });

  it("never leaves its zone, transit included", () => {
    // Two zones separated by a corridor: without a zone-restricted
    // route a wanderer would happily cut through the neighbour's turf.
    const twoZone = makeMap({
      interactables: [],
      ambient: {
        count: 2,
        zones: [
          { id: "north", x: 1, y: 1, width: 4, height: 2 },
          { id: "south", x: 1, y: 4, width: 4, height: 2 },
        ],
      },
    });
    const rects = new Map(
      (twoZone.ambient?.zones ?? []).map((zone) => [zone.id, zone]),
    );
    let crowd = createCrowd(twoZone);
    for (let i = 0; i < 3600; i++) {
      crowd = stepCrowd(crowd, twoZone, 1 / 60);
      for (const ped of crowd.pedestrians) {
        const zone = rects.get(ped.zoneId);
        if (!zone) throw new Error(`unknown zone ${ped.zoneId}`);
        expect(inZone(zone, ped.tile.x, ped.tile.y), ped.id).toBe(true);
        for (const step of ped.path) {
          expect(inZone(zone, step.x, step.y), `${ped.id} route`).toBe(true);
        }
      }
    }
  });

  it("stands still for a zero or negative delta", () => {
    const crowd = createCrowd(map);
    expect(stepCrowd(crowd, map, 0)).toBe(crowd);
    expect(stepCrowd(crowd, map, -1)).toBe(crowd);
  });

  it("dwells in place when its zone has nowhere to go", () => {
    const walled = makeMap({
      interactables: [],
      ambient: { count: 1, zones: [{ id: "nook", x: 1, y: 1, width: 1, height: 1 }] },
    });
    let crowd = createCrowd(walled);
    expect(crowd.pedestrians).toHaveLength(1);
    for (let i = 0; i < 1200; i++) crowd = stepCrowd(crowd, walled, 1 / 60);
    const [ped] = crowd.pedestrians;
    expect(ped?.tile).toEqual({ x: 1, y: 1 });
    expect(ped?.path).toEqual([]);
  });
});

describe("crowdEntities", () => {
  const map = makeMap();

  it("renders each pedestrian at its live position with its own look", () => {
    const crowd = run(createCrowd(map), map, 240);
    const entities = crowdEntities(crowd);
    expect(entities).toHaveLength(crowd.pedestrians.length);
    entities.forEach((entity, i) => {
      const ped = crowd.pedestrians[i];
      if (!ped) throw new Error("missing pedestrian");
      expect(entity.spriteId).toBe(ambientSpriteId(ped.lookSeed));
      expect(entity.position).toEqual(ped.position);
      expect(entity.facing).toBe(ped.facing);
      expect(entity.moving).toBe(ped.path.length > 0);
    });
  });

  it("depth-sorts with the player and props by the same x+y rule", () => {
    // A pedestrian mid-step between the player's tile and the crate
    // must land between them in painter's order, not on either side.
    const drawables = [
      { x: 2, y: 2, layer: "object" as const, tag: "crate" },
      { x: 3, y: 4, layer: "object" as const, tag: "player" },
      { x: 2.5, y: 3, layer: "object" as const, tag: "pedestrian" },
      { x: 1, y: 1, layer: "ground" as const, tag: "tile" },
    ];
    expect([...drawables].sort(compareDrawables).map((d) => d.tag)).toEqual([
      "tile",
      "crate",
      "pedestrian",
      "player",
    ]);
  });
});

describe("stepPedestrian", () => {
  const map = makeMap();

  it("faces the direction it is walking", () => {
    const base: AmbientPedestrian = {
      id: "p",
      lookSeed: 1,
      zoneId: "yard",
      tile: { x: 1, y: 1 },
      position: { x: 1, y: 1 },
      facing: "s",
      path: [{ x: 2, y: 1 }],
      progress: 0,
      idleFor: 0,
      speed: 2,
      rng: { seed: 7 },
    };
    const zones = resolveZones(map);
    expect(stepPedestrian(base, map, zones, 0.1).facing).toBe("e");
    expect(
      stepPedestrian({ ...base, path: [{ x: 1, y: 0 }] }, map, zones, 0.1).facing,
    ).toBe("n");
  });

  it("crosses several tiles in one long frame without skipping any", () => {
    const zones = resolveZones(map);
    const ped: AmbientPedestrian = {
      id: "p",
      lookSeed: 1,
      zoneId: "yard",
      tile: { x: 1, y: 1 },
      position: { x: 1, y: 1 },
      facing: "s",
      path: [
        { x: 2, y: 1 },
        { x: 3, y: 1 },
        { x: 4, y: 1 },
      ],
      progress: 0,
      idleFor: 0,
      speed: 30,
      rng: { seed: 7 },
    };
    // A 0.1s frame at 30 tiles/s consumes the whole path; the walk ends
    // parked on the last tile rather than overshooting the map.
    const stepped = stepPedestrian(ped, map, zones, 0.1);
    expect(stepped.tile).toEqual({ x: 4, y: 1 });
    expect(stepped.path).toEqual([]);
    expect(stepped.position).toEqual({ x: 4, y: 1 });
    expect(stepped.idleFor).toBeGreaterThan(0);
  });
});
