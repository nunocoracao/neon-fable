import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import {
  POINT_POOL,
  STAT_MAX,
  STAT_MIN,
  baseStats,
  type Stats,
} from "../character/stats";
import {
  BREACH_CONTEXTS,
  breachDifficulty,
  breachFlag,
  requireBreachContext,
  type BreachContext,
} from "../data/breach";
import { installEnhancement } from "../inventory/equipment";
import { addItem } from "../inventory/inventory";
import { BREACH_RESCUE_FAILURES, noAssists } from "../data/assists";
import {
  requireDifficulty,
  tunedCredits,
  type DifficultyId,
} from "../data/difficulty";
import { createNewGame, type GameState } from "../state";
import { BreachError, breachOutcome, routeBreach, stepBreach, withdrawBreach } from "./breach";
import {
  BREACH_NET_BONUS,
  BREACH_TECH_FLOOR,
  CREDITS_PER_CHAIN,
  CREDITS_PER_DATA,
  breachAward,
  breachLockouts,
  breachRescueOffered,
  breachSpent,
  openBreach,
  readRunner,
  settleBreach,
} from "./runner";
import { solveRoute } from "./testSupport";

/**
 * The join: what a character brings to a terminal, and what a finished
 * run does to a playthrough. The rules themselves are pinned in
 * ./breach.test.ts; what is asserted here is that Tech, chrome and a
 * background reach the lattice, and that a payout can only ever land
 * once.
 */

/**
 * A point-buy line that puts the asked-for Tech in and spends the rest
 * of the pool wherever it fits — the pool has to come out exact.
 */
function allocationWithTech(tech: number): Stats {
  const allocation: Stats = { ...baseStats(), tech };
  let left = POINT_POOL - (tech - STAT_MIN);
  for (const key of ["body", "reflexes", "cool", "intelligence"] as const) {
    const spend = Math.min(STAT_MAX - STAT_MIN, left);
    allocation[key] += spend;
    left -= spend;
  }
  return allocation;
}

/** A run with a stat line and, optionally, chrome in it. */
function runner(options: {
  tech?: number;
  backgroundId?: string;
  enhancementId?: string;
} = {}): GameState {
  const allocation = allocationWithTech(options.tech ?? STAT_MIN);
  const character = fixtureCharacter({
    backgroundId: options.backgroundId,
    allocation,
  });
  const base = createNewGame({ character, seed: 4242 });
  if (!options.enhancementId) return base;
  const withItem = addItem(base.inventory, options.enhancementId, 1);
  const installed = installEnhancement(
    base.player,
    withItem,
    options.enhancementId,
  );
  return { ...base, player: installed.character, inventory: installed.inventory };
}

describe("what a runner brings", () => {
  it("buys buffer with Tech, and takes none away below the floor", () => {
    expect(readRunner(runner({ tech: 3 })).bonus).toBe(0);
    expect(readRunner(runner({ tech: BREACH_TECH_FLOOR })).bonus).toBe(0);
    expect(readRunner(runner({ tech: 8 })).bonus).toBe(8 - BREACH_TECH_FLOOR);
  });

  it("gives the Weave background a head start of its own", () => {
    // grid-diver also carries a Tech bonus of its own, so the two are
    // read off the same character rather than assumed to be separable.
    const diver = readRunner(runner({ tech: 5, backgroundId: "grid-diver" }));
    const courier = readRunner(runner({ tech: 5, backgroundId: "gutter-courier" }));
    expect(diver.bonus - courier.bonus).toBeGreaterThanOrEqual(BREACH_NET_BONUS);
    expect(diver.notes.join(" ")).toContain("Weave");
  });

  it("reads watchdogs off high Tech, and off a cortical lattice", () => {
    expect(readRunner(runner({ tech: 7 })).vision.traces).toBe(false);
    expect(readRunner(runner({ tech: 8 })).vision.traces).toBe(true);
    const wired = runner({ tech: 3, enhancementId: "cyb-lattice-coprocessor" });
    expect(readRunner(wired).vision.traces).toBe(true);
    // A dampener is neural hardware and helps with nothing here.
    const damped = runner({ tech: 3, enhancementId: "cyb-null-collar" });
    expect(readRunner(damped).vision.traces).toBe(false);
  });

  it("reads fragment yields only through threat optics", () => {
    expect(readRunner(runner({ tech: 10 })).vision.values).toBe(false);
    const optics = runner({ tech: 3, enhancementId: "cyb-optic-suite" });
    expect(readRunner(optics).vision.values).toBe(true);
    expect(readRunner(optics).notes.join(" ")).toContain("optics");
  });
});

describe("opening a terminal", () => {
  const context = requireBreachContext("vent-archive");

  it("shows the same lattice every time this save opens it", () => {
    const state = runner();
    expect(openBreach(state, context).lattice).toEqual(
      openBreach(state, context).lattice,
    );
    // A different playthrough gets a different grid.
    const other = { ...state, rng: { seed: state.rng.seed + 1 } };
    expect(openBreach(other, context).lattice).not.toEqual(
      openBreach(state, context).lattice,
    );
  });

  it("hands out the lattice's own cheapest route plus slack plus wiring", () => {
    const slack = breachDifficulty(context.difficulty).slack;
    const plain = openBreach(runner({ tech: 3 }), context);
    expect(plain.budget).toBe(plain.lattice.minCost + slack);
    const sharp = openBreach(runner({ tech: 9 }), context);
    expect(sharp.budget).toBe(
      sharp.lattice.minCost + slack + (9 - BREACH_TECH_FLOOR),
    );
  });
});

describe("what a run is worth", () => {
  const context = requireBreachContext("vent-archive");

  it("pays for the data and the chains, and hands over the payout", () => {
    const award = breachAward(context, {
      status: "breached",
      harvest: 7,
      chains: 2,
      budgetLeft: 3,
      steps: 9,
    });
    expect(award.credits).toBe(7 * CREDITS_PER_DATA + 2 * CREDITS_PER_CHAIN);
    expect(award.effects).toBe(context.rewards.effects);
    expect(award.shardId).toBe("shard-cordon-precedent");
  });

  it("pays a withdrawal for the data alone, where there is data to carry", () => {
    const outcome = {
      status: "withdrawn",
      harvest: 4,
      chains: 1,
      budgetLeft: 2,
      steps: 5,
    } as const;
    expect(breachAward(context, outcome)).toEqual({
      credits: 4 * CREDITS_PER_DATA,
      effects: [],
      shardId: null,
    });
    // A relay with nothing to carry out pays nothing for backing off.
    const relay = requireBreachContext("exec-muster");
    expect(breachAward(relay, outcome).credits).toBe(0);
  });

  it("pays nothing at all for a lockout", () => {
    expect(
      breachAward(context, {
        status: "locked-out",
        harvest: 9,
        chains: 3,
        budgetLeft: 0,
        steps: 12,
      }),
    ).toEqual({ credits: 0, effects: [], shardId: null });
  });
});

describe("settling a run into the playthrough", () => {
  const context = requireBreachContext("vent-archive");

  /** Plays the cheapest route through and settles it. */
  function breachIt(state: GameState, target: BreachContext = context) {
    let game = openBreach(state, target);
    for (const id of solveRoute(game.lattice)) game = stepBreach(game, id);
    expect(game.status).toBe("breached");
    return settleBreach(state, target, breachOutcome(game));
  }

  it("records the outcome, pays the credits, applies the payout, files the chip", () => {
    const state = runner({ tech: 6 });
    const settled = breachIt(state);
    expect(settled.alreadySpent).toBe(false);
    expect(settled.state.flags[breachFlag(context.id)]).toBe("breached");
    expect(settled.state.flags["vent-archive-read"]).toBe(true);
    expect(settled.state.credits).toBeGreaterThan(state.credits);
    expect(settled.state.lore.collected).toContain("shard-cordon-precedent");
    expect(settled.filedShardId).toBe("shard-cordon-precedent");
  });

  it("pays a terminal exactly once, however many times it is settled", () => {
    const first = breachIt(runner({ tech: 6 }));
    const again = settleBreach(first.state, context, {
      status: "breached",
      harvest: 99,
      chains: 9,
      budgetLeft: 9,
      steps: 9,
    });
    expect(again.alreadySpent).toBe(true);
    expect(again.state).toBe(first.state);
    expect(breachSpent(first.state, context.id)).toBe(true);
  });

  it("closes the terminal on a lockout too — failing costs the prize", () => {
    const state = runner();
    const settled = settleBreach(state, context, {
      status: "locked-out",
      harvest: 5,
      chains: 1,
      budgetLeft: 0,
      steps: 6,
    });
    expect(settled.state.flags[breachFlag(context.id)]).toBe("locked-out");
    expect(settled.state.credits).toBe(state.credits);
    expect(settled.state.lore.collected).toEqual([]);
    expect(breachSpent(settled.state, context.id)).toBe(true);
  });

  it("never files a chip this run is already carrying twice", () => {
    const state = runner({ tech: 6 });
    const carrying: GameState = {
      ...state,
      lore: { collected: ["shard-cordon-precedent"] },
    };
    const settled = breachIt(carrying);
    expect(settled.filedShardId).toBeNull();
    expect(settled.state.lore.collected).toEqual(["shard-cordon-precedent"]);
  });

  it("walks a withdrawal out with its share and closes the door", () => {
    const state = runner({ tech: 6 });
    let game = openBreach(state, context);
    game = stepBreach(game, solveRoute(game.lattice)[0]!);
    const settled = settleBreach(state, context, breachOutcome(withdrawBreach(game)));
    expect(settled.state.flags[breachFlag(context.id)]).toBe("withdrawn");
    expect(settled.state.flags["vent-archive-read"]).toBeUndefined();
    expect(settled.state.credits).toBe(
      state.credits + game.harvest * CREDITS_PER_DATA,
    );
  });
});

describe("every placed terminal is beatable by the worst runner in the game", () => {
  // Tech 3 is the floor a character can be built at, with no chrome, no
  // background bonus and nothing equipped that helps. If the cheapest
  // route does not fit that runner's buffer, the content is a wall.
  const worst = runner({ tech: 3 });
  const seeds = Array.from({ length: 25 }, (_, i) => i * 104729 + 17);

  it.each(BREACH_CONTEXTS.map((context) => [context.id, context] as const))(
    "%s",
    (_id, context) => {
      for (const seed of seeds) {
        const state: GameState = { ...worst, rng: { seed } };
        let game = openBreach(state, context);
        const route = solveRoute(game.lattice);
        expect(route.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const id of route) game = stepBreach(game, id);
        expect(game.status, `seed ${seed}`).toBe("breached");
        expect(game.budget, `seed ${seed}`).toBeGreaterThanOrEqual(0);
      }
    },
  );
});

/**
 * The breach-rescue assist, and the preset's cut of a payday. Both act
 * on the settlement rather than on the lattice: the grid a terminal
 * generates is the same grid at every difficulty with every switch in
 * every position (it is seeded off the context and the run), and that
 * is asserted here too.
 */

function runWith(
  difficulty: DifficultyId,
  assists: Partial<Record<string, boolean>> = {},
  flags: GameState["flags"] = {},
): GameState {
  const base = createNewGame({ seed: 99 });
  return {
    ...base,
    flags: { ...base.flags, ...flags },
    rules: {
      difficulty,
      assists: { ...noAssists(), ...assists },
      difficultyChanged: false,
    },
  };
}

/** Flags recording `count` terminals that locked the run out. */
function lockouts(count: number): GameState["flags"] {
  const flags: GameState["flags"] = {};
  for (let i = 0; i < count; i++) flags[breachFlag(`ctx-${i}`)] = "locked-out";
  return flags;
}

describe("counting lockouts", () => {
  it("counts only the terminals that actually shut the run out", () => {
    const state = runWith("grind", {}, {
      ...lockouts(2),
      [breachFlag("ctx-won")]: "breached",
      [breachFlag("ctx-left")]: "withdrawn",
      "not-a-breach": "locked-out",
    });
    expect(breachLockouts(state)).toBe(2);
  });

  it("counts nothing on a run that has not touched a terminal", () => {
    expect(breachLockouts(runWith("grind"))).toBe(0);
  });
});

describe("when a lattice offers to route itself", () => {
  it("offers nothing with the assist off, however many lockouts", () => {
    expect(
      breachRescueOffered(runWith("grind", {}, lockouts(BREACH_RESCUE_FAILURES))),
    ).toBe(false);
  });

  it("offers nothing until the run has taken enough lockouts", () => {
    for (let taken = 0; taken < BREACH_RESCUE_FAILURES; taken++) {
      expect(
        breachRescueOffered(
          runWith("grind", { "breach-rescue": true }, lockouts(taken)),
        ),
        `after ${taken}`,
      ).toBe(false);
    }
  });

  it("offers once the switch is on and the lockouts are in", () => {
    expect(
      breachRescueOffered(
        runWith(
          "grind",
          { "breach-rescue": true },
          lockouts(BREACH_RESCUE_FAILURES),
        ),
      ),
    ).toBe(true);
  });

  it("keeps offering past the threshold", () => {
    expect(
      breachRescueOffered(
        runWith(
          "grind",
          { "breach-rescue": true },
          lockouts(BREACH_RESCUE_FAILURES + 3),
        ),
      ),
    ).toBe(true);
  });
});

describe("a route handed over", () => {
  const context = BREACH_CONTEXTS[0]!;

  it("counts as a breach, so the core's own prize is paid", () => {
    const state = runWith("grind", { "breach-rescue": true });
    const routed = routeBreach(openBreach(state, context));
    expect(routed.status).toBe("breached");
    const settled = settleBreach(state, context, breachOutcome(routed));
    expect(settled.state.flags[breachFlag(context.id)]).toBe("breached");
    if (context.rewards.shardId) {
      expect(settled.filedShardId).toBe(context.rewards.shardId);
    }
  });

  it("pays nothing for the route, because nothing was routed", () => {
    const state = runWith("grind", { "breach-rescue": true });
    const outcome = breachOutcome(routeBreach(openBreach(state, context)));
    expect(outcome.harvest).toBe(0);
    expect(outcome.chains).toBe(0);
    expect(outcome.steps).toBe(0);
    expect(breachAward(context, outcome).credits).toBe(0);
  });

  it("refuses to route a run that is already over", () => {
    const game = routeBreach(openBreach(runWith("grind"), context));
    expect(() => routeBreach(game)).toThrow(BreachError);
  });
});

describe("what a preset says a terminal pays", () => {
  const context = BREACH_CONTEXTS[0]!;

  /** A clean breach on this preset, settled, with what it paid. */
  function fullBreach(difficulty: DifficultyId): {
    state: GameState;
    settled: ReturnType<typeof settleBreach>;
  } {
    const state = runWith(difficulty);
    let game = openBreach(state, context);
    for (const id of solveRoute(game.lattice)) game = stepBreach(game, id);
    return { state, settled: settleBreach(state, context, breachOutcome(game)) };
  }

  it("scales what the route earned, preset by preset", () => {
    const earned = fullBreach("grind").settled.award.credits;
    expect(earned).toBeGreaterThan(0);
    for (const difficulty of ["drift", "blackout"] as DifficultyId[]) {
      expect(fullBreach(difficulty).settled.award.credits).toBe(
        tunedCredits(
          earned,
          requireDifficulty(difficulty).modifiers.creditRewardPct,
        ),
      );
    }
  });

  it("leaves the core's authored prize alone, as encounter items are", () => {
    // What the context *holds* is the story's, not the economy's: a
    // preset takes a cut of the payday and never of the unlock.
    for (const difficulty of ["drift", "grind", "blackout"] as DifficultyId[]) {
      const { state, settled } = fullBreach(difficulty);
      expect(settled.state.flags[breachFlag(context.id)]).toBe("breached");
      expect(settled.filedShardId).toBe(context.rewards.shardId ?? null);
      // The credits actually banked are the scaled route plus whatever
      // the authored effects paid, which is the same at every preset.
      const banked = settled.state.credits - state.credits;
      expect(banked - settled.award.credits).toBe(
        fullBreach("grind").settled.state.credits -
          fullBreach("grind").state.credits -
          fullBreach("grind").settled.award.credits,
      );
    }
  });

  it("generates the same lattice at every preset and every switch", () => {
    const base = JSON.stringify(openBreach(runWith("grind"), context).lattice);
    for (const difficulty of ["drift", "grind", "blackout"] as DifficultyId[]) {
      for (const rescue of [false, true]) {
        expect(
          JSON.stringify(
            openBreach(
              runWith(difficulty, { "breach-rescue": rescue }),
              context,
            ).lattice,
          ),
          `${difficulty}/${rescue}`,
        ).toBe(base);
      }
    }
  });
});
