import { describe, expect, it } from "vitest";
import { takedownFlag } from "../data/stealth";
import { detectAt, withinBounds } from "./detect";
import { patrolStepAt } from "./patrol";
import { testRoom, testZone } from "./testSupport";
import { guardViews, liveGuards } from "./watch";

const map = testRoom();
const zone = testZone();
const walker = zone.guards[0]!;

/** The first tick the walker is standing on (3,1) looking south. */
const AT_TOP = 0;

describe("what the watch holds", () => {
  it("puts a guard where their own route says, and points the cone there", () => {
    const [view] = guardViews(map, zone, AT_TOP, {});
    expect(view?.tile).toEqual({ x: 3, y: 1 });
    expect(view?.facing).toBe("s");
    expect(view?.seen).toEqual([
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 3, y: 4 },
    ]);
  });

  it("keeps a guard the run has stood down off the beat entirely", () => {
    const flags = { [takedownFlag(zone.id, "walker")]: true };
    expect(liveGuards(zone, flags).map((g) => g.id)).toEqual(["machine"]);
    expect(guardViews(map, zone, AT_TOP, flags)).toHaveLength(1);
  });

  it("keeps a guard whose absence flag is written off it too", () => {
    const absent = testZone({
      guards: [{ ...walker, absentWhenFlag: "the-lights-are-out" }],
    });
    expect(guardViews(map, absent, AT_TOP, {})).toHaveLength(1);
    expect(
      guardViews(map, absent, AT_TOP, { "the-lights-are-out": true }),
    ).toHaveLength(0);
  });
});

describe("being seen", () => {
  const views = guardViews(map, zone, AT_TOP, {});

  it("catches anybody standing inside a cone, crouching or not", () => {
    for (const crouched of [false, true]) {
      const caught = detectAt(zone, views, { x: 3, y: 3 }, { crouched });
      expect(caught?.sense).toBe("sight");
      expect(caught?.guardId).toBe("walker");
      expect(caught?.bark).toBe(walker.bark);
    }
  });

  it("does not catch somebody stood beside the cone", () => {
    expect(detectAt(zone, views, { x: 2, y: 3 }, { crouched: true })).toBeNull();
  });
});

describe("being heard", () => {
  const views = guardViews(map, zone, AT_TOP, {});

  it("catches ordinary footsteps on the tiles around a guard", () => {
    // (2,1) is beside the walker and behind their cone: safe crouched,
    // and not safe at all at a walk.
    expect(detectAt(zone, views, { x: 2, y: 1 }, { crouched: true })).toBeNull();
    const heard = detectAt(zone, views, { x: 2, y: 1 }, { crouched: false });
    expect(heard?.sense).toBe("sound");
    expect(heard?.guardId).toBe("walker");
  });

  it("carries exactly one tile", () => {
    expect(detectAt(zone, views, { x: 1, y: 1 }, { crouched: false })).toBeNull();
  });

  it("reports sight rather than sound when both would have you", () => {
    expect(detectAt(zone, views, { x: 3, y: 2 }, { crouched: false })?.sense).toBe(
      "sight",
    );
  });
});

describe("the bounds of a crossing", () => {
  it("is the rectangle the zone declares", () => {
    expect(withinBounds(zone.bounds, { x: 1, y: 1 })).toBe(true);
    expect(withinBounds(zone.bounds, { x: 7, y: 4 })).toBe(true);
    expect(withinBounds(zone.bounds, { x: 1, y: 5 })).toBe(false);
    expect(withinBounds(zone.bounds, { x: 0, y: 2 })).toBe(false);
  });

  it("means a cone reaching past the far edge catches nobody standing there", () => {
    // A guard on the bottom row of the bounds looking south holds (x,5)
    // — but (x,5) is past the crossing, so standing there is safe.
    const overreaching = testZone({
      guards: [
        {
          ...walker,
          route: { waypoints: [{ x: 1, y: 4, facing: "s" }] },
          vision: { range: 3, spread: 0 },
        },
      ],
    });
    const views = guardViews(map, overreaching, 0, {});
    expect(views[0]?.seen).toContainEqual({ x: 1, y: 5 });
    expect(
      detectAt(overreaching, views, { x: 1, y: 5 }, { crouched: true }),
    ).toBeNull();
  });
});

describe("the watch moves", () => {
  it("holds different ground on different ticks", () => {
    const held = (tick: number): string =>
      guardViews(map, zone, tick, {})
        .flatMap((view) => view.seen.map((t) => `${t.x},${t.y}`))
        .sort()
        .join(" ");
    const stamps = new Set(
      [...Array(8).keys()].map((tick) => held(tick)),
    );
    expect(stamps.size).toBeGreaterThan(1);
  });

  it("agrees with the route it came from at every tick", () => {
    for (let tick = 0; tick < 16; tick++) {
      const [view] = guardViews(map, zone, tick, {});
      const step = patrolStepAt(walker.route, tick);
      expect(view?.tile).toEqual({ x: step.x, y: step.y });
    }
  });
});
