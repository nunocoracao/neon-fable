import { describe, expect, it } from "vitest";
import { SETPIECE_ART } from "./art/setpieces";
import type { TilePoint } from "./coords";
import {
  DRONE_BOB_PX,
  STEAM_MOUTH_OFFSET_Y,
  TRAIN_CAR_SPAN,
  VENT_RAIN_FACTOR,
  collectSetPieces,
  droneDraws,
  dronePathLength,
  droneStateAt,
  setPieceGlows,
  trainDraws,
  trainRunAt,
  ventBurstFrameAt,
  ventDraws,
} from "./setpiece";
import type {
  DronePath,
  IsoMap,
  PropPlacement,
  TrainTrack,
  VentBurstSpec,
} from "./tilemap";

const TRACK: TrainTrack = {
  id: "test-line",
  row: -1,
  fromX: -8,
  toX: 24,
  cars: 3,
  heightPx: 62,
  periodMs: 27_000,
  crossMs: 7_600,
};

const LOOP: DronePath = {
  id: "test-beat",
  waypoints: [
    { x: 2, y: 2 },
    { x: 10, y: 2 },
    { x: 10, y: 8 },
    { x: 2, y: 8 },
  ],
  speed: 2,
  heightPx: 36,
};

const VENTS: VentBurstSpec = { periodMs: 4_000, chance: 0.4 };

function makeMap(props: PropPlacement[], setPieces?: IsoMap["setPieces"]): IsoMap {
  return {
    id: "test-map",
    name: "Test",
    width: 12,
    height: 10,
    tiles: Array.from({ length: 10 }, () =>
      Array.from({ length: 12 }, () => "pavement" as const),
    ),
    props,
    interactables: [],
    spawns: [{ id: "player-start", x: 0, y: 0 }],
    setPieces,
  };
}

const vent = (x: number, y: number): PropPlacement => ({
  propId: "vent-stack",
  x,
  y,
  blocks: true,
});

describe("the overline", () => {
  it("is out for its crossing and gone the rest of the period", () => {
    expect(trainRunAt(TRACK, 0)).not.toBeNull();
    expect(trainRunAt(TRACK, TRACK.crossMs - 1)).not.toBeNull();
    expect(trainRunAt(TRACK, TRACK.crossMs)).toBeNull();
    expect(trainRunAt(TRACK, TRACK.periodMs - 1)).toBeNull();
    // And it comes back round: the schedule is a loop, not a one-off.
    expect(trainRunAt(TRACK, TRACK.periodMs)).not.toBeNull();
    expect(trainRunAt(TRACK, TRACK.periodMs * 4 + 100)).not.toBeNull();
  });

  it("runs the declared span end to end, without ever going backwards", () => {
    const first = trainRunAt(TRACK, 0);
    const last = trainRunAt(TRACK, TRACK.crossMs - 1);
    expect(first?.headX).toBeCloseTo(TRACK.fromX, 5);
    expect(last?.headX).toBeGreaterThan(TRACK.toX - 0.05);
    let previous = -Infinity;
    for (let t = 0; t < TRACK.crossMs; t += 25) {
      const headX = trainRunAt(TRACK, t)?.headX ?? 0;
      expect(headX).toBeGreaterThanOrEqual(previous);
      previous = headX;
    }
  });

  it("sweeps through the middle of its span and eases at both ends", () => {
    const at = (fraction: number): number =>
      trainRunAt(TRACK, TRACK.crossMs * Math.min(fraction, 0.99999))?.headX ?? 0;
    const entering = at(0.2) - at(0);
    const middle = at(0.6) - at(0.4);
    const leaving = at(1) - at(0.8);
    expect(middle).toBeGreaterThan(entering * 1.5);
    expect(middle).toBeGreaterThan(leaving * 1.5);
    // Symmetric: it settles on the way out exactly as it gathered in.
    expect(entering).toBeCloseTo(leaving, 5);
  });

  it("trails a rake of cars a car-length apart behind the lead one", () => {
    const draws = trainDraws(TRACK, 2_000);
    expect(draws).toHaveLength(TRACK.cars + 1);
    expect(draws[0]?.spriteId).toBe("train-head");
    expect(draws.slice(1).map((d) => d.spriteId)).toEqual([
      "train-car",
      "train-car",
      "train-car",
    ]);
    const head = draws[0];
    draws.forEach((draw, i) => {
      expect(draw.y).toBe(TRACK.row);
      expect(draw.offsetY).toBe(-TRACK.heightPx);
      // Travelling east, so each car sits further back down the line —
      // which is also a smaller x + y, so painter's order lays the rake
      // down back to front with no set-piece-specific depth handling.
      expect(draw.x).toBeCloseTo((head?.x ?? 0) - i * TRAIN_CAR_SPAN, 5);
    });
  });

  it("runs the other way down a track declared the other way", () => {
    const westbound: TrainTrack = { ...TRACK, fromX: 24, toX: -8 };
    const draws = trainDraws(westbound, 2_000);
    const head = draws[0]?.x ?? 0;
    // The rake still trails the head — now to the east of it.
    expect(draws[1]?.x).toBeCloseTo(head + TRAIN_CAR_SPAN, 5);
  });

  it("is a function of the clock alone", () => {
    expect(trainDraws(TRACK, 3_333)).toEqual(trainDraws(TRACK, 3_333));
    expect(trainDraws(TRACK, 3_333)).not.toEqual(trainDraws(TRACK, 3_433));
  });

  it("draws nothing for a track with no crossing time", () => {
    expect(trainRunAt({ ...TRACK, crossMs: 0 }, 0)).toBeNull();
    expect(trainDraws({ ...TRACK, crossMs: 0 }, 0)).toEqual([]);
  });
});

/** Distance from a point to the closest point on segment a→b. */
function distanceToSegment(p: TilePoint, a: TilePoint, b: TilePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const k =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + dx * k), p.y - (a.y + dy * k));
}

describe("patrol drones", () => {
  it("measures the closed circuit, not just the legs between waypoints", () => {
    // 8 across, 6 down, 8 back, 6 up — the closing leg counts.
    expect(dronePathLength(LOOP)).toBeCloseTo(28, 5);
    expect(dronePathLength({ ...LOOP, waypoints: [{ x: 1, y: 1 }] })).toBe(0);
  });

  it("never leaves its declared loop", () => {
    const points = LOOP.waypoints;
    for (let t = 0; t < 40_000; t += 97) {
      const state = droneStateAt(LOOP, t);
      expect(state).not.toBeNull();
      const position = state?.position ?? { x: 0, y: 0 };
      const nearest = Math.min(
        ...points.map((from, i) =>
          distanceToSegment(position, from, points[(i + 1) % points.length] ?? from),
        ),
      );
      expect(nearest).toBeLessThan(1e-9);
    }
  });

  it("comes back to where it started after exactly one lap", () => {
    const lapMs = (dronePathLength(LOOP) / LOOP.speed) * 1000;
    const start = droneStateAt(LOOP, 0);
    const lap = droneStateAt(LOOP, lapMs);
    expect(lap?.position.x).toBeCloseTo(start?.position.x ?? 0, 6);
    expect(lap?.position.y).toBeCloseTo(start?.position.y ?? 0, 6);
  });

  it("faces the way it is flying", () => {
    // Second leg of the loop runs south; the drone looks south on it.
    const southbound = droneStateAt(LOOP, 4_500);
    expect(southbound?.facing).toBe("s");
    const eastbound = droneStateAt(LOOP, 500);
    expect(eastbound?.facing).toBe("e");
  });

  it("bobs about its cruise height without ever leaving it", () => {
    let low = Infinity;
    let high = -Infinity;
    for (let t = 0; t < 20_000; t += 53) {
      const offset = droneDraws(LOOP, t)[0]?.offsetY ?? 0;
      low = Math.min(low, offset);
      high = Math.max(high, offset);
    }
    expect(low).toBeGreaterThanOrEqual(-LOOP.heightPx - DRONE_BOB_PX - 1e-9);
    expect(high).toBeLessThanOrEqual(-LOOP.heightPx + DRONE_BOB_PX + 1e-9);
    // It really does move — a "bob" pinned to one value is not one.
    expect(high - low).toBeGreaterThan(DRONE_BOB_PX);
  });

  it("offsets a second drone along the same loop", () => {
    const trailing = droneStateAt({ ...LOOP, id: "b", offsetMs: 7_000 }, 0);
    const leading = droneStateAt(LOOP, 7_000);
    expect(trailing?.position).toEqual(leading?.position);
  });

  it("draws nothing for a path that is not a loop", () => {
    expect(droneStateAt({ ...LOOP, waypoints: [] }, 0)).toBeNull();
    expect(droneStateAt({ ...LOOP, waypoints: [{ x: 1, y: 1 }] }, 0)).toBeNull();
    expect(
      droneStateAt({ ...LOOP, waypoints: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }, 0),
    ).toBeNull();
    expect(droneDraws({ ...LOOP, waypoints: [] }, 0)).toEqual([]);
  });
});

describe("vented steam", () => {
  const frames = SETPIECE_ART["steam-burst"].frames.length;

  it("blows off on a seeded schedule and holds a whole burst when it does", () => {
    let bursts = 0;
    let seen = new Set<number>();
    for (let t = 0; t < 200_000; t += 20) {
      const frame = ventBurstFrameAt(3, 4, t, VENTS, frames);
      if (frame === null) continue;
      bursts++;
      seen.add(frame);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(frames);
    }
    expect(bursts).toBeGreaterThan(0);
    // Every frame of the burst gets shown — a schedule that only ever
    // caught the first frame would read as a stutter, not a plume.
    expect(seen.size).toBe(frames);
  });

  it("never vents two stacks in lockstep", () => {
    // Same schedule, different coordinates: the phase and the roll are
    // both seeded from the tile, so a street never puffs in unison.
    const a: Array<number | null> = [];
    const b: Array<number | null> = [];
    for (let t = 0; t < 40_000; t += 50) {
      a.push(ventBurstFrameAt(3, 4, t, VENTS, frames));
      b.push(ventBurstFrameAt(9, 2, t, VENTS, frames));
    }
    expect(a).not.toEqual(b);
  });

  it("vents harder in the rain, on the same schedule", () => {
    const count = (rain: boolean): number => {
      let n = 0;
      for (let t = 0; t < 400_000; t += 130) {
        if (ventBurstFrameAt(3, 4, t, VENTS, frames, rain) !== null) n++;
      }
      return n;
    };
    const dry = count(false);
    const wet = count(true);
    expect(wet).toBeGreaterThan(dry);
    // Roughly the declared factor — the rain does not simply pin it on.
    expect(wet / dry).toBeLessThan(VENT_RAIN_FACTOR * 1.4);
  });

  it("only ever comes out of a vent stack", () => {
    const map = makeMap([
      vent(3, 4),
      vent(9, 2),
      { propId: "crate", x: 5, y: 5, blocks: true },
      { propId: "streetlight", x: 6, y: 6, blocks: true },
    ]);
    const vents = new Set(["3,4", "9,2"]);
    for (let t = 0; t < 60_000; t += 40) {
      for (const draw of ventDraws(map, VENTS, t)) {
        expect(draw.spriteId).toBe("steam-burst");
        expect(vents.has(`${draw.x},${draw.y}`)).toBe(true);
        expect(draw.offsetY).toBe(STEAM_MOUTH_OFFSET_Y);
      }
    }
  });

  it("stays quiet for a cadence that never fires", () => {
    const map = makeMap([vent(3, 4)]);
    for (let t = 0; t < 40_000; t += 100) {
      expect(ventDraws(map, { periodMs: 4_000, chance: 0 }, t)).toEqual([]);
    }
  });
});

describe("the set-piece pass", () => {
  const map = makeMap([vent(3, 4), vent(9, 2)], {
    trains: [TRACK],
    drones: [LOOP],
    vents: VENTS,
  });

  it("gives a map that declares nothing nothing to draw", () => {
    expect(collectSetPieces(makeMap([vent(3, 4)]), 1_000)).toEqual([]);
  });

  it("replays identically from the clock alone", () => {
    for (const t of [0, 1_500, 26_400, 120_000]) {
      expect(collectSetPieces(map, t)).toEqual(collectSetPieces(map, t));
    }
  });

  it("puts the whole district's machinery in one pass", () => {
    const kinds = new Set<string>();
    for (let t = 0; t < 120_000; t += 100) {
      for (const draw of collectSetPieces(map, t, { rain: true })) {
        kinds.add(draw.spriteId);
      }
    }
    expect(kinds).toEqual(
      new Set(["train-head", "train-car", "patrol-drone", "steam-burst"]),
    );
  });

  it("withholds the flying and the fleeting under reduced motion", () => {
    // A train stopped dead in the sky and a plume hanging in the air
    // read as bugs; a hovering drone parked at its post does not.
    for (let t = 0; t < 60_000; t += 100) {
      const still = collectSetPieces(map, t, { motion: false });
      expect(still.map((d) => d.spriteId)).toEqual(["patrol-drone"]);
    }
  });

  it("holds one still pose when the scene freezes its clock", () => {
    // What the scene actually does under reduced motion: timeMs 0 and
    // motion off. Every frame is then the same frame.
    const frozen = collectSetPieces(map, 0, { motion: false });
    expect(collectSetPieces(map, 0, { motion: false })).toEqual(frozen);
    expect(frozen[0]?.frame).toBe(0);
  });
});

describe("set-piece light", () => {
  it("casts from where the piece actually is, elevation included", () => {
    const draws = trainDraws(TRACK, 2_000);
    const head = draws[0];
    const glows = setPieceGlows(draws);
    expect(glows.length).toBeGreaterThan(0);
    const source = SETPIECE_ART["train-head"].glow?.[0];
    const lamp = glows[0];
    expect(lamp?.x).toBe(head?.x);
    expect(lamp?.y).toBe(TRACK.row);
    // ART_SCALE-scaled, with the car's own 62px of elevation folded in.
    expect(lamp?.offsetY).toBe(((source?.offsetY ?? 0) - TRACK.heightPx) * 2);
  });

  it("gives way at dusk and bites in the small hours, like every lamp", () => {
    const draws = trainDraws(TRACK, 2_000);
    const dusk = setPieceGlows(draws, "dusk")[0]?.alpha ?? 0;
    const night = setPieceGlows(draws, "night")[0]?.alpha ?? 0;
    const late = setPieceGlows(draws, "late")[0]?.alpha ?? 0;
    expect(dusk).toBeLessThan(night);
    expect(late).toBeGreaterThan(night);
  });

  it("leaves a piece with no authored light dark", () => {
    const map = makeMap([vent(3, 4)], { vents: { periodMs: 4_000, chance: 1 } });
    let steam = collectSetPieces(map, 0);
    for (let t = 0; steam.length === 0 && t < 40_000; t += 50) {
      steam = collectSetPieces(map, t);
    }
    expect(steam.length).toBeGreaterThan(0);
    expect(setPieceGlows(steam)).toEqual([]);
  });
});
