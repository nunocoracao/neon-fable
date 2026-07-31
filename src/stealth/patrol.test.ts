import { describe, expect, it } from "vitest";
import type { PatrolRoute } from "../data/stealth";
import {
  PatrolError,
  patrolCycleLength,
  patrolPointAt,
  patrolStepAt,
  patrolSteps,
} from "./patrol";

/** A straight span walked end to end and back, with a pause at each end. */
const span: PatrolRoute = {
  waypoints: [
    { x: 2, y: 1, dwell: 1, facing: "n" },
    { x: 2, y: 4, dwell: 1, facing: "s" },
  ],
  loop: "pingpong",
};

/** A closed circuit round a room. */
const circuit: PatrolRoute = {
  waypoints: [
    { x: 1, y: 1 },
    { x: 3, y: 1 },
    { x: 3, y: 3 },
    { x: 1, y: 3 },
  ],
  loop: "cycle",
};

describe("expanding a route", () => {
  it("gives a waypoint 1 + dwell ticks and walks the legs between", () => {
    expect(patrolSteps(span)).toEqual([
      { x: 2, y: 1, facing: "n" },
      { x: 2, y: 1, facing: "n" },
      { x: 2, y: 2, facing: "s" },
      { x: 2, y: 3, facing: "s" },
      { x: 2, y: 4, facing: "s" },
      { x: 2, y: 4, facing: "s" },
      { x: 2, y: 3, facing: "n" },
      { x: 2, y: 2, facing: "n" },
    ]);
  });

  it("looks the way a waypoint declares, and the way it walks otherwise", () => {
    const steps = patrolSteps(circuit);
    // No authored facings: every tick looks along the leg it is walking.
    expect(steps.map((step) => `${step.x},${step.y} ${step.facing}`)).toEqual([
      "1,1 e",
      "2,1 e",
      "3,1 s",
      "3,2 s",
      "3,3 w",
      "2,3 w",
      "1,3 n",
      "1,2 n",
    ]);
  });

  it("closes: the last tick's successor is the first, one tile away", () => {
    for (const route of [span, circuit]) {
      const steps = patrolSteps(route);
      const last = steps[steps.length - 1]!;
      const first = steps[0]!;
      const gap = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
      expect(gap).toBeLessThanOrEqual(1);
    }
  });

  it("never jumps: consecutive ticks are the same tile or adjacent", () => {
    for (const route of [span, circuit]) {
      const steps = patrolSteps(route);
      for (let i = 0; i < steps.length; i++) {
        const here = steps[i]!;
        const next = steps[(i + 1) % steps.length]!;
        expect(
          Math.abs(here.x - next.x) + Math.abs(here.y - next.y),
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("refuses a leg that is not axis-aligned, loudly", () => {
    const diagonal: PatrolRoute = {
      waypoints: [
        { x: 0, y: 0 },
        { x: 2, y: 3 },
      ],
    };
    expect(() => patrolSteps(diagonal)).toThrow(PatrolError);
  });

  it("refuses a route with nowhere to stand", () => {
    expect(() => patrolSteps({ waypoints: [] })).toThrow(PatrolError);
  });

  it("holds a single-waypoint route as a standing post", () => {
    const post: PatrolRoute = { waypoints: [{ x: 5, y: 5, facing: "w" }] };
    expect(patrolSteps(post)).toEqual([{ x: 5, y: 5, facing: "w" }]);
  });
});

describe("reading a route at a tick", () => {
  it("is the same answer for the same tick, forever", () => {
    const length = patrolCycleLength(span);
    for (let tick = 0; tick < length; tick++) {
      expect(patrolStepAt(span, tick + length * 137)).toEqual(
        patrolStepAt(span, tick),
      );
      expect(patrolStepAt(span, tick + 10_000 * length)).toEqual(
        patrolStepAt(span, tick),
      );
    }
  });

  it("wraps backwards too, so a clock that slips does not throw", () => {
    expect(patrolStepAt(span, -1)).toEqual(
      patrolStepAt(span, patrolCycleLength(span) - 1),
    );
  });

  it("floors a fractional tick to the tick it is inside", () => {
    expect(patrolStepAt(span, 2.9)).toEqual(patrolStepAt(span, 2));
  });
});

describe("drawing a guard between ticks", () => {
  it("interpolates along the leg being walked", () => {
    const half = patrolPointAt(span, 2.5);
    expect(half).toEqual({ x: 2, y: 2.5, facing: "s", moving: true });
  });

  it("stands still through a dwell", () => {
    const standing = patrolPointAt(span, 0.5);
    expect(standing).toEqual({ x: 2, y: 1, facing: "n", moving: false });
  });

  it("lands exactly on the tile at a whole tick", () => {
    for (let tick = 0; tick < patrolCycleLength(span); tick++) {
      const point = patrolPointAt(span, tick);
      const step = patrolStepAt(span, tick);
      expect({ x: point.x, y: point.y }).toEqual({ x: step.x, y: step.y });
    }
  });
});
