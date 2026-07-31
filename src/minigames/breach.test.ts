import { describe, expect, it } from "vitest";
import { BREACH_DIFFICULTIES } from "../data/breach";
import {
  BreachError,
  CHAIN_LENGTH,
  CHAIN_REFUND,
  FRAGMENT_TYPES,
  breachOutcome,
  breachSeed,
  canStep,
  cheapestRouteCost,
  generateLattice,
  headId,
  latticeNode,
  latticeView,
  nodeId,
  nodeView,
  requireNode,
  startBreach,
  stepBreach,
  stepCostOf,
  stepRefusal,
  stepTargets,
  undoBreach,
  visibleKind,
  withdrawBreach,
  type BreachGame,
  type BreachLattice,
  type BreachProfile,
  type LatticeSpec,
} from "./breach";
import { latticeFrom } from "./testSupport";

/**
 * The minigame, on its own. Generation is asserted as properties over a
 * spread of seeds (it is seeded, so pinning one grid's bytes would pin
 * nothing worth knowing); the rules are asserted against hand-authored
 * lattices, where what is on the grid is the point.
 */

const SIGHTED: BreachProfile["vision"] = { traces: true, values: true };
const BLIND: BreachProfile["vision"] = { traces: false, values: false };

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

/** A game on a hand-authored grid with plenty of room, unless told otherwise. */
function play(
  rows: readonly string[],
  options: { budget?: number; vision?: BreachProfile["vision"] } = {},
): BreachGame {
  const lattice = latticeFrom(rows);
  return startBreach(lattice, {
    budget: options.budget ?? 30,
    vision: options.vision ?? SIGHTED,
  });
}

/** Routes a run through a list of "x,y" ids in order. */
function route(game: BreachGame, ...ids: string[]): BreachGame {
  return ids.reduce((current, id) => stepBreach(current, id), game);
}

describe("lattice generation", () => {
  const spec: LatticeSpec = {
    width: 6,
    height: 5,
    traces: 5,
    deads: 4,
    traceCost: [2, 3],
    value: [1, 4],
  };

  it("is a pure function of spec and seed", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      expect(generateLattice(spec, seed)).toEqual(generateLattice(spec, seed));
    }
    // And a different seed is a different grid — a generator that
    // ignored its seed would pass every other test in this file.
    const grids = new Set(
      SEEDS.map((seed) => JSON.stringify(generateLattice(spec, seed).nodes)),
    );
    expect(grids.size).toBeGreaterThan(SEEDS.length / 2);
  });

  it("lays out a full grid with the entry and core facing each other", () => {
    for (const seed of SEEDS) {
      const lattice = generateLattice(spec, seed);
      expect(lattice.nodes).toHaveLength(spec.width * spec.height);
      const middle = Math.floor(spec.height / 2);
      expect(lattice.entryId).toBe(nodeId(0, middle));
      expect(lattice.coreId).toBe(nodeId(spec.width - 1, middle));
      expect(requireNode(lattice, lattice.entryId).kind).toBe("entry");
      expect(requireNode(lattice, lattice.coreId).kind).toBe("core");
      // Ids are unique and positional — every path, set and view is
      // keyed on them.
      expect(new Set(lattice.nodes.map((n) => n.id)).size).toBe(
        lattice.nodes.length,
      );
      for (const node of lattice.nodes) {
        expect(node.id).toBe(nodeId(node.x, node.y));
      }
    }
  });

  it("seeds exactly the corruption the spec asked for", () => {
    for (const seed of SEEDS) {
      const lattice = generateLattice(spec, seed);
      const kinds = lattice.nodes.map((node) => node.kind);
      expect(kinds.filter((k) => k === "dead")).toHaveLength(spec.deads);
      expect(kinds.filter((k) => k === "trace")).toHaveLength(spec.traces);
      for (const node of lattice.nodes) {
        if (node.kind === "trace") {
          expect(node.traceCost).toBeGreaterThanOrEqual(spec.traceCost[0]);
          expect(node.traceCost).toBeLessThanOrEqual(spec.traceCost[1]);
        } else {
          expect(node.traceCost, node.id).toBe(0);
        }
        if (node.kind === "data" || node.kind === "trace") {
          // A trace carries a fragment and a yield like any other node,
          // which is exactly why it cannot be spotted by what it holds.
          expect(FRAGMENT_TYPES).toContain(node.fragment);
          expect(node.value).toBeGreaterThanOrEqual(spec.value[0]);
          expect(node.value).toBeLessThanOrEqual(spec.value[1]);
        } else {
          expect(node.fragment, node.id).toBeNull();
          expect(node.value, node.id).toBe(0);
        }
      }
    }
  });

  it("is always routable, and says how cheaply", () => {
    for (const difficulty of BREACH_DIFFICULTIES) {
      for (const seed of SEEDS) {
        const lattice = generateLattice(difficulty.lattice, seed);
        expect(lattice.minCost, `${difficulty.id}/${seed}`).toBeLessThan(
          Infinity,
        );
        // The corridor is carved one column at a time with at most one
        // row of drift, so the cheapest route can never be worse than
        // twice the width.
        expect(lattice.minCost).toBeGreaterThanOrEqual(lattice.width - 1);
        expect(lattice.minCost).toBeLessThanOrEqual(2 * lattice.width);
        expect(lattice.minCost).toBe(
          cheapestRouteCost(
            lattice.nodes,
            lattice.width,
            lattice.height,
            lattice.entryId,
            lattice.coreId,
          ),
        );
      }
    }
  });

  it("derives a stable seed per terminal per playthrough", () => {
    expect(breachSeed("vent-archive", 7)).toBe(breachSeed("vent-archive", 7));
    expect(breachSeed("vent-archive", 7)).not.toBe(breachSeed("vent-archive", 8));
    expect(breachSeed("vent-archive", 7)).not.toBe(
      breachSeed("market-register", 7),
    );
  });
});

describe("routing rules", () => {
  // A back row nobody has to use, and the direct run underneath it.
  const ROWS = ["bcb#", "EaaC"];

  it("starts on the entry with the full buffer and nothing harvested", () => {
    const game = play(ROWS, { budget: 9 });
    expect(game.path).toEqual(["0,1"]);
    expect(game.lattice.entryId).toBe("0,1");
    expect(game.budget).toBe(9);
    expect(game.budgetMax).toBe(9);
    expect(game.harvest).toBe(0);
    expect(game.status).toBe("running");
  });

  it("charges a move for a step and the watchdog's bill for a trace", () => {
    const clean = stepBreach(play(ROWS, { budget: 9 }), "1,1");
    expect(clean.budget).toBe(8);
    expect(clean.harvest).toBe(1);

    // 1 for the move, 2 for standing on something that logs.
    const trap = stepBreach(play(["EW#", "aaC"], { budget: 9 }), "1,0");
    expect(trap.budget).toBe(6);
    expect(trap.sprung).toEqual(["1,0"]);
  });

  it("refuses everything that is not a legal hop, and charges for none of it", () => {
    const game = play(["Ea#", "bbC"], { budget: 9 });
    const refusals: Array<[string, string]> = [
      ["2,1", "not-adjacent"],
      ["0,0", "already-routed"],
    ];
    for (const [id, code] of refusals) {
      expect(stepRefusal(game, id)?.code, id).toBe(code);
      expect(() => stepBreach(game, id)).toThrow(BreachError);
    }
    // Dead ground is refused from right beside it.
    const beside = stepBreach(game, "1,0");
    expect(stepRefusal(beside, "2,0")?.code).toBe("dead-node");
    expect(stepRefusal(game, "9,9")?.code).toBe("unknown-node");
    // Nothing above touched the buffer.
    expect(game.budget).toBe(9);
  });

  it("will not sell a hop the buffer cannot pay for", () => {
    const game = play(["EW", "aC"], { budget: 2 });
    // The trace costs three; the clean neighbour costs one.
    expect(stepRefusal(game, "1,0")?.code).toBe("no-budget");
    expect(canStep(game, "0,1")).toBe(true);
    expect(stepTargets(game).map((node) => node.id)).toEqual(["0,1"]);
  });

  it("reports every legal hop from where the runner stands", () => {
    const game = play(["Eab", "b#C"], { budget: 9 });
    expect(stepTargets(game).map((node) => node.id)).toEqual(["1,0", "0,1"]);
    const moved = stepBreach(game, "1,0");
    // Back the way you came is already routed; down is dead ground.
    expect(stepTargets(moved).map((node) => node.id)).toEqual(["2,0"]);
  });
});

describe("fragment chains", () => {
  it("refunds a chain of three and counts it, resetting the run", () => {
    // Six of the same fragment in a row: two chains, two refunds.
    const game = play(["Eaaaaaa", "######C"], { budget: 20 });
    let current = game;
    const seen: number[] = [];
    for (let x = 1; x <= 6; x++) {
      current = stepBreach(current, nodeId(x, 0));
      seen.push(current.chains);
    }
    expect(seen).toEqual([0, 0, 1, 1, 1, 2]);
    // Six moves out, two refunds back in.
    expect(current.budget).toBe(20 - 6 + 2 * CHAIN_REFUND);
    expect(current.chain).toBe(0);
  });

  it("breaks the chain on a different fragment and starts a new one", () => {
    const game = play(["Eaabaa", "#####C"], { budget: 20 });
    const routed = route(game, "1,0", "2,0", "3,0", "4,0", "5,0");
    expect(routed.chains).toBe(0);
    expect(routed.chain).toBe(2);
    expect(CHAIN_LENGTH).toBe(3);
  });

  it("chains through a trace, because a trace carries a fragment too", () => {
    const game = play(["EaWa", "###C"], { budget: 20 });
    const routed = route(game, "1,0", "2,0", "3,0");
    expect(routed.chains).toBe(1);
    expect(routed.sprung).toEqual(["2,0"]);
  });
});

describe("undo", () => {
  it("rewinds the route, the harvest and the chain — but never the budget", () => {
    // A watchdog on a different fragment, so nothing chains and the
    // budget arithmetic is the whole story.
    const game = play(["EaaX", "###C"], { budget: 12 });
    const routed = route(game, "1,0", "2,0", "3,0");
    expect(routed.budget).toBe(12 - 1 - 1 - 3);
    expect(routed.chain).toBe(1);
    expect(routed.harvest).toBe(3);

    const back = undoBreach(routed);
    expect(back.path).toEqual(["0,0", "1,0", "2,0"]);
    expect(back.harvest).toBe(2);
    expect(back.chains).toBe(0);
    expect(back.chain).toBe(2);
    // The wasted hop stays wasted: this is what a sprung trace costs.
    expect(back.budget).toBe(routed.budget);
    // And what it taught you is kept.
    expect(back.sprung).toEqual(["3,0"]);
  });

  it("lets a retraced node be routed again, at full price", () => {
    const game = play(["Eaa", "##C"], { budget: 12 });
    const back = undoBreach(stepBreach(game, "1,0"));
    expect(canStep(back, "1,0")).toBe(true);
    expect(stepBreach(back, "1,0").budget).toBe(10);
  });

  it("refuses to rewind off the entry node", () => {
    const game = play(["Ea", "#C"], { budget: 9 });
    expect(() => undoBreach(game)).toThrow(/entry node/);
    expect(() => undoBreach(withdrawBreach(game))).toThrow(BreachError);
  });
});

describe("how a run ends", () => {
  it("is a breach the moment the core is reached", () => {
    const game = play(["EaC", "###"], { budget: 9 });
    const done = route(game, "1,0", "2,0");
    expect(done.status).toBe("breached");
    expect(breachOutcome(done)).toEqual({
      status: "breached",
      harvest: 1,
      chains: 0,
      budgetLeft: 7,
      steps: 2,
    });
    // Nothing moves after the core.
    expect(stepTargets(done)).toEqual([]);
    expect(() => stepBreach(done, "1,0")).toThrow(/run is over/);
  });

  it("locks out when the buffer runs dry short of the core", () => {
    const game = play(["EaaC", "####"], { budget: 2 });
    const spent = route(game, "1,0", "2,0");
    expect(spent.budget).toBe(0);
    expect(spent.status).toBe("locked-out");
    expect(breachOutcome(spent).status).toBe("locked-out");
  });

  it("locks out on an entry nothing affordable leads off", () => {
    // Every way on costs three; the buffer holds two.
    const game = play(["EW#", "W#C"], { budget: 2 });
    expect(game.status).toBe("locked-out");
  });

  it("walks out on request, keeping what the route harvested", () => {
    const game = play(["EaaC", "####"], { budget: 9 });
    const out = withdrawBreach(route(game, "1,0", "2,0"));
    expect(out.status).toBe("withdrawn");
    expect(breachOutcome(out)).toMatchObject({
      status: "withdrawn",
      harvest: 2,
      steps: 2,
    });
    expect(() => withdrawBreach(out)).toThrow(BreachError);
  });

  it("has nothing to report while a run is still going", () => {
    expect(() => breachOutcome(play(["EaC", "###"]))).toThrow(/still going/);
  });
});

describe("what the runner can see", () => {
  const ROWS = ["EaW", "##C"];

  it("hides a watchdog behind an ordinary node until it is sprung", () => {
    const blind = play(ROWS, { budget: 12, vision: BLIND });
    const trace = requireNode(blind.lattice, "2,0");
    expect(visibleKind(blind, trace)).toBe("data");
    // It advertises the price of what it is pretending to be.
    expect(nodeView(blind, trace).cost).toBe(1);

    const sprung = route(blind, "1,0", "2,0");
    expect(visibleKind(sprung, trace)).toBe("trace");
    expect(nodeView(sprung, trace).cost).toBe(stepCostOf(trace));
  });

  it("marks every watchdog up front for a runner who can read them", () => {
    const sighted = play(ROWS, { budget: 12, vision: SIGHTED });
    expect(visibleKind(sighted, requireNode(sighted.lattice, "2,0"))).toBe(
      "trace",
    );
  });

  it("blanks fragment yields without optics, and never after routing one", () => {
    const blind = play(ROWS, { budget: 12, vision: BLIND });
    expect(nodeView(blind, requireNode(blind.lattice, "1,0")).value).toBeNull();
    const walked = stepBreach(blind, "1,0");
    // A node you have already taken has no secrets left.
    expect(nodeView(walked, requireNode(blind.lattice, "1,0")).value).toBe(1);

    const sighted = play(ROWS, { budget: 12, vision: SIGHTED });
    expect(nodeView(sighted, requireNode(sighted.lattice, "1,0")).value).toBe(1);
  });

  it("draws the whole grid, marking the path and the head", () => {
    const game = route(play(ROWS, { budget: 12 }), "1,0");
    const view = latticeView(game);
    expect(view).toHaveLength(6);
    expect(view.filter((cell) => cell.onPath).map((cell) => cell.id)).toEqual([
      "0,0",
      "1,0",
    ]);
    expect(view.filter((cell) => cell.head).map((cell) => cell.id)).toEqual([
      "1,0",
    ]);
    expect(headId(game)).toBe("1,0");
    expect(view.filter((cell) => cell.steppable).map((cell) => cell.id)).toEqual(
      ["2,0"],
    );
  });
});

describe("hand-authored lattices", () => {
  it("read their own cheapest route the way generated ones do", () => {
    const lattice: BreachLattice = latticeFrom(["EaaC", "#WW#"]);
    expect(lattice.minCost).toBe(3);
    expect(latticeNode(lattice, "1,1")?.traceCost).toBe(2);
  });

  it("refuse a grid with no way in or out", () => {
    expect(() => latticeFrom(["aaa"])).toThrow(/no entry/);
    expect(() => latticeFrom(["Eaa"])).toThrow(/no core/);
    expect(() => latticeFrom(["E?C"])).toThrow(/unknown/);
    expect(() => latticeFrom(["EaC", "aa"])).toThrow(/length/);
  });
});
