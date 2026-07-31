import { describe, expect, it } from "vitest";
import { getEncounter } from "../encounters";
import { requireEnemy } from "../enemies";
import { act3Arc } from "./act3";
import { makeVossState, routeVossToTakeover } from "./walkthroughRoutes";
import {
  advanceStep,
  findRouteSeed,
  healStep,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * The Warden Chassis, fought for real.
 *
 * Everything else about the multi-tile boss is checked in pieces — block
 * math in src/combat/footprint.test.ts, the wind-up in
 * src/combat/charge.test.ts, the art in src/iso/art/mech.test.ts. This
 * is the one that says the thing is *playable*: a scripted playthrough
 * walks a real character from creation through two acts, up the
 * executive riser, past the floor detail, into the strongroom, and out
 * the other side of the fight — with every gate on the way actually
 * passing, because applyChoice throws when one does not.
 *
 * The fight autoplays on the combat screen's own policy against the
 * real AI, so the chassis declares its volley, walks its block around
 * the arena, and swings its piston exactly as it would in a browser.
 * Only fight *losses* retry a seed (findRouteSeed) — a gating bug
 * throws and fails loudly.
 */

/** The six advancement points three chapters earn, spent like a player. */
const spendPoints: RouteStep[] = [
  advanceStep("body"),
  advanceStep("reflexes"),
  advanceStep("reflexes"),
];

describe("the Warden Chassis, in a real playthrough", () => {
  const { state } = findRouteSeed(makeVossState, [
    ...routeVossToTakeover,
    ...spendPoints,
    healStep(),
    {
      // Up the riser on the chair's own override, past the detail the
      // same way, and down the aisle to what is sealing the far end.
      kind: "arc",
      arc: act3Arc,
      entry: "a3-start",
      choices: [
        "takeover", // opening gated on act2-outcome = takeover
        "glasshouse",
        "terms",
        "go",
        "riser", // the second riser, the one with no call button
        "standing", // the chair's override calls the car
        "checkpoint",
        "override", // and clears the floor detail without a shot
        "on",
        "safe", // the lockbox under the wall bench, before the hard part
        "force",
        "strongroom", // gated on exec-cleared
        "wake", // pull the sheet off
        "fight", // enc-exec-warden
        "take",
      ],
    },
  ]);

  it("is reachable: every gate on the way to it passes", () => {
    expect(state.flags["exec-lockbox"]).toBe(true);
    expect(state.flags["exec-known"]).toBe(true);
    expect(state.flags["exec-cleared"]).toBe(true);
    expect(state.flags["warden-woken"]).toBe(true);
  });

  it("is beatable: the fight resolves in victory and pays out", () => {
    expect(state.flags["combat:enc-exec-warden"]).toBe("victory");
    expect(state.flags["warden-down"]).toBe(true);
    // The strongroom float is the reward for the heaviest fight in the
    // tower — the encounter's own spoils plus what was behind the door.
    const rewards = getEncounter("enc-exec-warden")?.rewards;
    expect(rewards?.credits).toBeGreaterThan(0);
    expect(state.credits).toBeGreaterThan(rewards?.credits ?? 0);
  });

  it("stays a side trip: the finale is reachable without ever going up", () => {
    // Proven by the act3 walkthroughs, which reach all four endings
    // without touching the strongroom — this only pins that the beat
    // sets nothing the spine reads (act3.test.ts checks that directly).
    expect(state.flags["act3-complete"]).toBeUndefined();
  });

  it("really is the multi-tile fight, alone on its arena", () => {
    const encounter = getEncounter("enc-exec-warden")!;
    expect(encounter.enemies).toHaveLength(1);
    expect(encounter.enemies[0]?.enemyId).toBe("nme-warden-chassis");
    expect(requireEnemy("nme-warden-chassis").footprint).toEqual({
      width: 2,
      height: 2,
    });
    // Nowhere to run from a strongroom door.
    expect(encounter.fleeable).toBe(false);
  });
});
