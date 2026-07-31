import { describe, expect, it } from "vitest";
import { liveSpawns, requireEncounter } from "../data/encounters";
import {
  STEALTH_TICK_MS,
  alertFlag,
  stealthZoneFlag,
  takedownAllowance,
  takedownFlag,
} from "../data/stealth";
import type { FlagMap } from "../state/flags";
import {
  LUNGE_GRACE_TICKS,
  applyLunge,
  lungeOffer,
  onGoal,
  pinchAt,
  recordPassed,
  recordSpotted,
  recordTakedown,
  startStealth,
  stepStealth,
  takedownOffer,
  takedownsUsed,
  tickAt,
  tickFloat,
  toggleCrouch,
  type StealthRun,
} from "./run";
import { testRoom, testZone } from "./testSupport";
import { guardViews } from "./watch";

const map = testRoom();
const zone = testZone();

function fresh(): StealthRun {
  return startStealth(zone);
}

function step(
  run: StealthRun,
  tick: number,
  tile: { x: number; y: number },
  flags: FlagMap = {},
) {
  return stepStealth(map, zone, run, { tick, playerTile: tile, flags });
}

describe("the tick clock", () => {
  it("counts whole ticks off the scene's own elapsed time", () => {
    expect(tickAt(0)).toBe(0);
    expect(tickAt(STEALTH_TICK_MS - 1)).toBe(0);
    expect(tickAt(STEALTH_TICK_MS)).toBe(1);
    expect(tickAt(STEALTH_TICK_MS * 4.9)).toBe(4);
    // A clock that has not started, or has gone backwards, is tick zero.
    expect(tickAt(-500)).toBe(0);
  });

  it("keeps the fraction for drawing, and only for drawing", () => {
    expect(tickFloat(STEALTH_TICK_MS / 2)).toBeCloseTo(0.5);
    expect(Math.floor(tickFloat(STEALTH_TICK_MS * 3.7))).toBe(tickAt(STEALTH_TICK_MS * 3.7));
  });
});

describe("detection happens on tick boundaries", () => {
  it("catches somebody standing in a cone when the tick turns", () => {
    const result = step(fresh(), 1, { x: 3, y: 3 });
    expect(result.event).toEqual({
      kind: "spotted",
      detection: expect.objectContaining({ guardId: "walker", sense: "sight" }),
    });
    expect(result.run.status).toBe("spotted");
  });

  it("does not catch them between two ticks", () => {
    const run = { ...fresh(), checkedTick: 1 };
    // Same lit tile, same tick already asked about: nothing fires.
    expect(step(run, 1.9, { x: 3, y: 3 }).event).toBeNull();
  });

  it("fires exactly once, however many frames follow", () => {
    let run = fresh();
    const first = step(run, 1, { x: 3, y: 3 });
    run = first.run;
    expect(first.event?.kind).toBe("spotted");
    for (const tick of [1.2, 2, 3, 4]) {
      const later = step(run, tick, { x: 3, y: 3 });
      expect(later.event).toBeNull();
      run = later.run;
    }
  });

  it("lets a crossing timed between sweeps through", () => {
    // (3,4) is the far end of the walker's own lane. At tick 1 the
    // walker is at the top of it looking down and the tile is lit; five
    // ticks later they are standing on the other end of the room.
    const lit = guardViews(map, zone, 1, {}).some((view) =>
      view.seen.some((tile) => tile.x === 3 && tile.y === 4),
    );
    expect(lit).toBe(true);
    let run = fresh();
    for (const tick of [1, 2, 3]) {
      // Standing out of the lane the whole time it is lit.
      const result = step(run, tick, { x: 6, y: 4 });
      expect(result.event).toBeNull();
      run = result.run;
    }
    expect(run.status).toBe("watching");
  });
});

describe("crouching", () => {
  it("silences footsteps and changes nothing about being looked at", () => {
    const standing = step(fresh(), 1, { x: 2, y: 1 });
    expect(standing.event?.kind).toBe("spotted");
    const crouched = step(toggleCrouch(fresh()), 1, { x: 2, y: 1 });
    expect(crouched.event).toBeNull();
    // The cone is still the cone.
    expect(step(toggleCrouch(fresh()), 1, { x: 3, y: 2 }).event?.kind).toBe(
      "spotted",
    );
  });

  it("toggles both ways and carries nothing else with it", () => {
    const down = toggleCrouch(fresh());
    expect(down.crouched).toBe(true);
    expect(toggleCrouch(down).crouched).toBe(false);
    expect(toggleCrouch(down).status).toBe("watching");
  });
});

describe("reaching the far side", () => {
  it("ends the crossing the moment the goal tile is stood on", () => {
    const result = step(fresh(), 3, { x: 1, y: 5 });
    expect(result.event).toEqual({ kind: "passed" });
    expect(result.run.status).toBe("passed");
    expect(onGoal(zone, { x: 1, y: 5 })).toBe(true);
    expect(onGoal(zone, { x: 2, y: 5 })).toBe(false);
  });

  it("does not need a tick boundary — being past is being past", () => {
    const run = { ...fresh(), checkedTick: 99 };
    expect(step(run, 99, { x: 1, y: 5 }).event).toEqual({ kind: "passed" });
  });

  it("is over once it is over: a settled run reports nothing again", () => {
    const passed = step(fresh(), 3, { x: 1, y: 5 }).run;
    expect(step(passed, 4, { x: 3, y: 3 }).event).toBeNull();
    expect(step(passed, 4, { x: 3, y: 3 }).run.status).toBe("passed");
  });
});

describe("the lunge at a pinch point", () => {
  it("is offered from the pinch's own tile and nowhere else", () => {
    expect(pinchAt(zone, { x: 1, y: 3 })?.id).toBe("mouth");
    expect(pinchAt(zone, { x: 2, y: 3 })).toBeNull();
    expect(lungeOffer(zone, fresh(), { x: 2, y: 3 }, 9)).toEqual({
      ok: false,
      reason: "no-pinch",
    });
  });

  it("asks for the reflexes it declares", () => {
    expect(lungeOffer(zone, fresh(), { x: 1, y: 3 }, 5)).toEqual({
      ok: false,
      reason: "too-slow",
    });
    const offer = lungeOffer(zone, fresh(), { x: 1, y: 3 }, 6);
    expect(offer.ok && offer.pinch.to).toEqual({ x: 1, y: 5 });
  });

  it("buys exactly one tick of not being looked at", () => {
    const dashed = applyLunge(fresh());
    expect(dashed.grace).toBe(LUNGE_GRACE_TICKS);
    // The tick the dash covers: lit ground, and nothing happens.
    const covered = step(dashed, 1, { x: 3, y: 3 });
    expect(covered.event).toBeNull();
    expect(covered.run.grace).toBe(0);
    // The next one is asked like any other.
    expect(step(covered.run, 2, { x: 3, y: 3 }).event?.kind).toBe("spotted");
  });

  it("is not offered once the crossing is over", () => {
    const passed = step(fresh(), 3, { x: 1, y: 5 }).run;
    expect(lungeOffer(zone, passed, { x: 1, y: 3 }, 9)).toEqual({
      ok: false,
      reason: "over",
    });
  });
});

describe("takedowns", () => {
  const views = (tick: number, flags: FlagMap = {}) =>
    guardViews(map, zone, tick, flags);

  it("needs somebody within reach", () => {
    expect(
      takedownOffer(zone, fresh(), views(0), { x: 7, y: 4 }, {
        flags: {},
        quiet: false,
      }),
    ).toEqual({ ok: false, reason: "no-target" });
  });

  it("takes the guard beside you, from behind", () => {
    // Tick 0: the walker is on (3,1) looking south. (2,1) is beside
    // them and out of the cone.
    const offer = takedownOffer(zone, fresh(), views(0), { x: 2, y: 1 }, {
      flags: {},
      quiet: false,
    });
    expect(offer.ok && offer.guard.guardId).toBe("walker");
  });

  it("refuses somebody who is looking straight at you", () => {
    // Tick 2: the walker is on (3,2) walking south, so (3,3) is both
    // adjacent and inside the cone.
    const offer = takedownOffer(zone, fresh(), views(2), { x: 3, y: 3 }, {
      flags: {},
      quiet: false,
    });
    expect(offer).toEqual({ ok: false, reason: "aware" });
  });

  it("refuses a machine, whatever angle it is approached from", () => {
    const offer = takedownOffer(zone, fresh(), views(0), { x: 6, y: 3 }, {
      flags: {},
      quiet: false,
    });
    expect(offer).toEqual({ ok: false, reason: "immune" });
  });

  it("is allowed once per zone, and twice behind a veil", () => {
    expect(takedownAllowance(zone, false)).toBe(1);
    expect(takedownAllowance(zone, true)).toBe(1);
    const veiled = testZone({ takedowns: 1, quietTakedowns: 2 });
    expect(takedownAllowance(veiled, false)).toBe(1);
    expect(takedownAllowance(veiled, true)).toBe(2);
  });

  it("counts what the run has already spent, off the flags", () => {
    const spent = recordTakedown({}, zone, "walker");
    expect(spent[takedownFlag(zone.id, "walker")]).toBe(true);
    expect(takedownsUsed(zone, spent)).toBe(1);
    // Which is also what puts the offer out of reach — the walker is
    // gone from the watch, so there is nobody left to take.
    expect(
      takedownOffer(zone, fresh(), views(0, spent), { x: 2, y: 1 }, {
        flags: spent,
        quiet: false,
      }),
    ).toEqual({ ok: false, reason: "no-target" });
  });

  it("reports the allowance being spent when somebody else is in reach", () => {
    const twoWalkers = testZone({
      guards: [
        zone.guards[0]!,
        { ...zone.guards[0]!, id: "other", spawnSlot: 1, takedown: true },
      ],
    });
    const spent = recordTakedown({}, twoWalkers, "walker");
    const offer = takedownOffer(
      twoWalkers,
      fresh(),
      guardViews(map, twoWalkers, 0, spent),
      { x: 2, y: 1 },
      { flags: spent, quiet: false },
    );
    expect(offer).toEqual({ ok: false, reason: "spent" });
  });

  it("writes nothing for a guard the zone has never heard of", () => {
    expect(recordTakedown({}, zone, "nobody")).toEqual({});
  });

  it("takes the body out of the fight it was going to be in", () => {
    const encounter = requireEncounter("enc-exec-security");
    expect(liveSpawns(encounter, {}).map((s) => s.slot)).toEqual([0, 1, 2]);
    // One string does the whole join: the flag a takedown writes is the
    // flag the spawn declares, so the watch and the fight can never
    // disagree about who is still standing.
    const stoodDown = liveSpawns(encounter, {
      [takedownFlag("exec-detail", "lead")]: true,
    });
    expect(stoodDown.map((s) => s.slot)).toEqual([1, 2]);
  });
});

describe("settling a crossing", () => {
  it("records getting past, and nothing else", () => {
    const flags = recordPassed({}, zone);
    expect(flags[stealthZoneFlag(zone.id)]).toBe("passed");
    expect(flags[alertFlag(zone.encounterId)]).toBeUndefined();
  });

  it("records being seen, and arms the fight", () => {
    const flags = recordSpotted({}, zone);
    expect(flags[stealthZoneFlag(zone.id)]).toBe("spotted");
    expect(flags[alertFlag(zone.encounterId)]).toBe(true);
  });

  it("leaves the flags it was handed alone", () => {
    const before: FlagMap = { "act3-complete": true };
    recordSpotted(before, zone);
    expect(before).toEqual({ "act3-complete": true });
  });
});
