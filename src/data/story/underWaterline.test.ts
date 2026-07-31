import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import { addItem, countItem, equip, installEnhancement } from "../../inventory";
import {
  applyChoice,
  availableChoices,
  companionAside,
  NarrativeError,
} from "../../narrative";
import type { Choice, Requirement } from "../../narrative/types";
import { createNewGame, recruitCompanion, type GameState } from "../../state";
import { getItem } from "../items";
import { dressMap } from "../mapDressing";
import { requireMap } from "../maps";
import { quaysArc } from "./quays";
import {
  UNDER_WATERLINE_OUTCOMES,
  UNDER_WATERLINE_STAGES,
  UNDER_WATERLINE_STAGE_FLAG,
  underWaterlineNodes,
  type UnderWaterlineStage,
} from "./underWaterline";
import { findRouteSeed, makeState, type RouteStep } from "./walkthroughSupport";

/**
 * "Under the Waterline" — the Flooded Quays' side-quest chain.
 *
 * Graph soundness (targets, reachability, dead ends, unknown ids) is
 * covered for every arc by validate.test.ts, and the district's own
 * wiring by ./quays.test.ts. What is pinned here is what makes this a
 * quest rather than a conversation: that the first choice really is the
 * fork, that every road out of every scene lands somewhere terminal,
 * that the gates are the ones the content claims and between them let
 * every kind of build in, that no two settlements can ever be true at
 * once, that none of them can be collected twice, and that the one the
 * player earned is the one standing on the platform afterwards.
 */

const nodesById = new Map(underWaterlineNodes.map((node) => [node.id, node]));
const allChoices = underWaterlineNodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

/** The three scenes of the diver's road, in the order it passes through them. */
const SCENES = ["uw-ask", "uw-ring", "uw-inside"] as const;

/** Choices whose availability is the chain's own stage routing. */
const STAGE_ROUTING = new Set([
  "uw-ask-what",
  "uw-help",
  "uw-sell-out",
  "uw-resume-ring",
  "uw-resume-inside",
  "uw-resume-sold",
  "uw-account-broken",
  "uw-account-partner",
  "uw-break",
  "uw-terms",
  "uw-sell-licence",
]);

/**
 * Every gate on the character the content claims to have, written out
 * once. A stat renamed, a threshold nudged, an item id changed — any of
 * it fails here rather than silently locking a road.
 */
const DECLARED_GATES: Readonly<Record<string, Requirement[]>> = {
  "uw-ask-kade": [{ type: "flag-set", key: "vesper-joined" }],
  "uw-dive-gills": [{ type: "enhancement", itemId: "cyb-silt-gills" }],
  "uw-dive-rig": [{ type: "stat", stat: "tech", value: 7 }],
  "uw-boom": [{ type: "stat", stat: "body", value: 7 }],
  "uw-stack": [{ type: "stat", stat: "reflexes", value: 7 }],
  "uw-manifest": [{ type: "flag-set", key: "quays-cage" }],
  "uw-parley": [{ type: "stat", stat: "cool", value: 8 }],
  "uw-terms": [
    {
      type: "flag-equals",
      key: UNDER_WATERLINE_STAGE_FLAG,
      value: "inside",
    },
    { type: "stat", stat: "cool", value: 8 },
  ],
};

/** Every way into the bonded store, and what each records about itself. */
const WAYS_IN: Readonly<Record<string, string>> = {
  "uw-dive-gills": "dived",
  "uw-dive-rig": "rigged",
  "uw-boom": "hauled",
  "uw-stack": "climbed",
  "uw-manifest": "tagged",
  "uw-parley": "invited",
  "uw-force": "fought",
};

function isEnd(choice: Choice): boolean {
  return (choice.effects ?? []).some((effect) => effect.type === "end");
}

function requireChoice(nodeId: string, choiceId: string): Choice {
  const choice = nodesById.get(nodeId)?.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`no choice "${choiceId}" on "${nodeId}"`);
  return choice;
}

/**
 * A character who can take every road: shoulders, hands, a head for
 * numbers and a cool one on top of it, gills in the ribs, and the
 * strand's salvage cage already open behind them. The whole point pool
 * goes on it and every gate clears by exactly nothing — which is the
 * honest way to say these thresholds are the top of the range a build
 * can reach, not a formality.
 */
function capableRunner(): GameState {
  const base = makeState(
    "gutter-courier",
    (a) => {
      a.body += 3;
      a.reflexes += 2;
      a.tech += 4;
      a.cool += 6;
    },
    7,
  );
  const inventory = addItem(base.inventory, "cyb-silt-gills");
  const loadout = installEnhancement(base.player, inventory, "cyb-silt-gills");
  return {
    ...base,
    player: loadout.character,
    inventory: loadout.inventory,
    credits: 400,
    flags: { "quays-cage": "hauled" },
  };
}

/** A character with none of it: no stats, no chrome, nothing opened. */
function bareRunner(): GameState {
  return {
    ...createNewGame({ character: fixtureCharacter({}), seed: 11 }),
    credits: 0,
  };
}

/** Plays a route of choice ids from a node, returning the state after. */
function playRoute(
  start: GameState,
  entryNodeId: string,
  choiceIds: string[],
): GameState {
  let state = start;
  let nodeId: string | null = entryNodeId;
  for (const choiceId of choiceIds) {
    const node = nodesById.get(nodeId ?? "");
    if (!node) throw new Error(`no node "${nodeId}" for choice "${choiceId}"`);
    const outcome = applyChoice(state, node, choiceId);
    state = outcome.state;
    nodeId = outcome.nextNodeId;
  }
  return state;
}

/** One place a walk of the chain came to rest. */
interface Terminal {
  nodeId: string;
  choiceId: string;
  /** Where it left the chain, for a choice that hands back to the district. */
  exitNodeId?: string;
  state: GameState;
}

/**
 * Walks every reachable route from `uw-ask` for one character,
 * exhaustively: at each node every choice the engine would actually
 * offer is taken. Revisits of the same node in the same state are
 * pruned (the chain's loops are conversational), so this terminates.
 * A target outside the chain is a terminal too — the chain handing the
 * player back to the district's own conversation.
 */
function walkChain(start: GameState): Terminal[] {
  const terminals: Terminal[] = [];
  const seen = new Set<string>();
  const frontier: Array<{ nodeId: string; state: GameState }> = [
    { nodeId: "uw-ask", state: start },
  ];
  let guard = 0;
  while (frontier.length > 0) {
    if (guard++ > 5000) throw new Error("chain walk did not converge");
    const { nodeId, state } = frontier.pop()!;
    const key = `${nodeId}|${JSON.stringify(state.flags)}|${state.credits}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = nodesById.get(nodeId)!;
    const offered = availableChoices(state, node).filter((p) => p.enabled);
    expect(
      offered.length,
      `node ${nodeId} offers the player nothing`,
    ).toBeGreaterThan(0);
    for (const { choice } of offered) {
      const outcome = applyChoice(state, node, choice.id);
      const next = outcome.nextNodeId;
      if (next === null) {
        terminals.push({ nodeId, choiceId: choice.id, state: outcome.state });
        continue;
      }
      if (!nodesById.has(next)) {
        terminals.push({
          nodeId,
          choiceId: choice.id,
          exitNodeId: next,
          state: outcome.state,
        });
        continue;
      }
      frontier.push({ nodeId: next, state: outcome.state });
    }
  }
  return terminals;
}

/** The settlement flags a state is holding, if any. */
function settlements(state: GameState): string[] {
  return Object.values(UNDER_WATERLINE_OUTCOMES)
    .filter((outcome) => state.flags[outcome.flag] === true)
    .map((outcome) => outcome.flag);
}

describe("under the waterline", () => {
  it("hangs off the diver, and is entered nowhere else", () => {
    const diver = quaysArc.nodes.find((node) => node.id === "fq-diver");
    expect(diver?.choices.map((c) => c.target)).toContain("uw-ask");
    // Every other way into the chain is from inside the chain: no map
    // interactable and no district beat short-circuits into the middle.
    const outsideTargets = quaysArc.nodes
      .filter((node) => !node.id.startsWith("uw-"))
      .flatMap((node) => node.choices.flatMap((c) => c.target ?? []))
      .filter((target) => target.startsWith("uw-"));
    expect(outsideTargets).toEqual(["uw-ask"]);
  });

  it("forks at its very first choice into two roads that never rejoin", () => {
    // The whole quest is the two choices on the ask, and each writes the
    // side it took. Both gate on the stage being unset, so exactly one
    // can ever be taken.
    const help = requireChoice("uw-ask", "uw-help");
    const sell = requireChoice("uw-ask", "uw-sell-out");
    for (const choice of [help, sell]) {
      expect(choice.requirements, choice.id).toEqual([
        { type: "flag-unset", key: UNDER_WATERLINE_STAGE_FLAG },
      ]);
    }
    expect(help.effects).toContainEqual({
      type: "set-flag",
      key: "under-waterline-side",
      value: "diver",
    });
    expect(sell.effects).toContainEqual({
      type: "set-flag",
      key: "under-waterline-side",
      value: "ring",
    });
    // And the two roads share no node between the ask and their endings.
    const reachable = (from: string): Set<string> => {
      const seen = new Set<string>();
      const frontier = [from];
      while (frontier.length > 0) {
        const id = frontier.pop()!;
        if (seen.has(id) || id === "uw-ask") continue;
        seen.add(id);
        for (const choice of nodesById.get(id)?.choices ?? []) {
          if (choice.target) frontier.push(choice.target);
        }
      }
      return seen;
    };
    const diverRoad = reachable("uw-taken");
    const ringRoad = reachable("uw-sell");
    expect([...diverRoad].filter((id) => ringRoad.has(id))).toEqual([]);
  });

  it("runs the ask, then the ring, then the settlement", () => {
    for (const nodeId of SCENES) {
      expect(nodesById.has(nodeId), nodeId).toBe(true);
    }
    const reaches = (from: string, to: string): boolean => {
      const frontier = [from];
      const seen = new Set<string>();
      while (frontier.length > 0) {
        const id = frontier.pop()!;
        if (id === to) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const choice of nodesById.get(id)?.choices ?? []) {
          if (choice.target) frontier.push(choice.target);
        }
      }
      return false;
    };
    expect(reaches("uw-taken", "uw-ring")).toBe(true);
    expect(reaches("uw-ring", "uw-inside")).toBe(true);
    // The ring's road is three scenes too: ask, the tender, the price.
    expect(reaches("uw-sell", "uw-abandoned")).toBe(true);
    // And the fight in the district's arena is one of the ways through
    // the middle scene, not the only one.
    expect(requireChoice("uw-ring", "uw-force").effects).toContainEqual({
      type: "start-combat",
      encounterId: "enc-quays-salvage",
    });
    expect(
      nodesById
        .get("uw-ring")!
        .choices.filter((c) => c.target === "uw-inside")
        .map((c) => c.id),
    ).toEqual(Object.keys(WAYS_IN));
  });

  it("gates exactly the approaches it declares, and nothing else", () => {
    for (const [choiceId, requirements] of Object.entries(DECLARED_GATES)) {
      const owner = allChoices.find(({ choice }) => choice.id === choiceId);
      expect(owner, choiceId).toBeDefined();
      expect(owner?.choice.requirements, choiceId).toEqual(requirements);
    }
    // Nothing else in the chain gates on the character at all: the
    // remaining requirements are stage routing, so a run is never
    // stopped by a build — only offered fewer roads.
    for (const { choice } of allChoices) {
      if (DECLARED_GATES[choice.id]) continue;
      for (const requirement of choice.requirements ?? []) {
        expect(
          ["flag-equals", "flag-unset"],
          `${choice.id} gates on ${requirement.type}`,
        ).toContain(requirement.type);
        expect(STAGE_ROUTING.has(choice.id), choice.id).toBe(true);
      }
    }
  });

  it("spreads the ways in across every kind of build", () => {
    // Body, Reflexes, Tech, a set of gills, a cool head, the district's
    // own gated container — and one road that asks nothing of anybody.
    const gatedBy = (kind: string, detail: string): string[] =>
      Object.keys(WAYS_IN).filter((id) =>
        (DECLARED_GATES[id] ?? []).some((requirement) =>
          requirement.type !== kind
            ? false
            : requirement.type === "stat"
              ? requirement.stat === detail
              : requirement.type === "enhancement"
                ? requirement.itemId === detail
                : requirement.type === "flag-set"
                  ? requirement.key === detail
                  : false,
        ),
      );
    expect(gatedBy("stat", "body")).toEqual(["uw-boom"]);
    expect(gatedBy("stat", "reflexes")).toEqual(["uw-stack"]);
    expect(gatedBy("stat", "tech")).toEqual(["uw-dive-rig"]);
    expect(gatedBy("stat", "cool")).toEqual(["uw-parley"]);
    expect(gatedBy("enhancement", "cyb-silt-gills")).toEqual(["uw-dive-gills"]);
    // The dive is the enhancement road, and Tech is its other half —
    // chrome in the ribs or the wit to build what the chrome does.
    expect(requireChoice("uw-ring", "uw-dive-rig").target).toBe(
      requireChoice("uw-ring", "uw-dive-gills").target,
    );
    // The container route is the district task's cage, cashed in: it
    // asks only that the cage came open, either of its two ways.
    expect(gatedBy("flag-set", "quays-cage")).toEqual(["uw-manifest"]);
    for (const cage of ["hauled", "dived"]) {
      const state: GameState = {
        ...bareRunner(),
        flags: {
          "quays-cage": cage,
          [UNDER_WATERLINE_STAGE_FLAG]: "taken",
        },
      };
      const offered = availableChoices(state, nodesById.get("uw-ring")!)
        .filter((p) => p.enabled)
        .map((p) => p.choice.id);
      expect(offered, cage).toContain("uw-manifest");
    }
    // And one way in is open to anybody at all.
    expect(requireChoice("uw-ring", "uw-force").requirements).toBeUndefined();
  });

  it("opens every road at once for a character built for all of them", () => {
    const state: GameState = {
      ...capableRunner(),
      flags: {
        ...capableRunner().flags,
        [UNDER_WATERLINE_STAGE_FLAG]: "taken",
      },
    };
    const offered = availableChoices(state, nodesById.get("uw-ring")!)
      .filter((p) => p.enabled)
      .map((p) => p.choice.id);
    for (const wayIn of Object.keys(WAYS_IN)) {
      expect(offered, wayIn).toContain(wayIn);
    }
  });

  it("records which way in was taken, one value per road", () => {
    for (const [choiceId, entry] of Object.entries(WAYS_IN)) {
      expect(requireChoice("uw-ring", choiceId).effects, choiceId).toContainEqual(
        { type: "set-flag", key: "under-waterline-entry", value: entry },
      );
    }
    expect(new Set(Object.values(WAYS_IN)).size).toBe(
      Object.keys(WAYS_IN).length,
    );
  });
});

describe("every road through the chain", () => {
  it("reaches a terminal, for a character who can take them all", () => {
    const terminals = walkChain(capableRunner());
    expect(terminals.length).toBeGreaterThan(0);
    for (const terminal of terminals) {
      if (terminal.exitNodeId) {
        // The only way out of the chain that is not an ending is back
        // into the diver's own conversation.
        expect(terminal.exitNodeId).toBe("fq-diver");
        continue;
      }
      expect(
        isEnd(requireChoice(terminal.nodeId, terminal.choiceId)),
        `${terminal.nodeId}/${terminal.choiceId}`,
      ).toBe(true);
    }
    // And all three settlements are among them.
    const stages = new Set(
      terminals.map((t) => t.state.flags[UNDER_WATERLINE_STAGE_FLAG]),
    );
    for (const stage of ["broken", "partner", "abandoned"]) {
      expect(stages, stage).toContain(stage);
    }
  });

  it("reaches a terminal for a character with no stats and no chrome", () => {
    const terminals = walkChain(bareRunner());
    const stages = new Set(
      terminals.map((t) => t.state.flags[UNDER_WATERLINE_STAGE_FLAG]),
    );
    // The gated roads are closed to them; the chain still finishes, and
    // the fork it turns on is still both ways open — a bare runner can
    // still break the ring, and can still sell her.
    expect(stages).toContain("broken");
    expect(stages).toContain("abandoned");
    for (const terminal of terminals) {
      if (terminal.exitNodeId) continue;
      expect(
        isEnd(requireChoice(terminal.nodeId, terminal.choiceId)),
        `${terminal.nodeId}/${terminal.choiceId}`,
      ).toBe(true);
    }
  });

  it("never lets two settlements be true at once", () => {
    for (const start of [capableRunner(), bareRunner()]) {
      for (const terminal of walkChain(start)) {
        expect(
          settlements(terminal.state).length,
          `${terminal.nodeId}/${terminal.choiceId} settled twice`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("can be walked away from at every single beat", () => {
    // Optional and missable, but never a trap: every node in the chain
    // offers a way out that no requirement can close.
    for (const node of underWaterlineNodes) {
      const exits = node.choices.filter(
        (choice) => isEnd(choice) && (choice.requirements ?? []).length === 0,
      );
      expect(exits.length, `node ${node.id} cannot be left`).toBeGreaterThan(0);
    }
  });

  it("routes a returning player back to the scene they abandoned", () => {
    // Quest state is the stage flag and nothing else — no log, no
    // bookkeeping — so every stage has to have a door back in. Five of
    // them are doors on the diver's own hub; the sixth is the one road
    // where she is not standing there to be asked, and there the door is
    // the map itself.
    const hubDoors: Partial<Record<UnderWaterlineStage, string>> = {
      taken: "uw-ring",
      inside: "uw-inside",
      sold: "uw-sell",
      broken: "uw-settled-broken",
      partner: "uw-settled-partner",
    };
    const quays = requireMap("flooded-quays");
    const hub = nodesById.get("uw-ask")!;
    for (const stage of UNDER_WATERLINE_STAGES) {
      const outcome = Object.values(UNDER_WATERLINE_OUTCOMES).find(
        (o) => o.platform.nodeId && stage === o.flag.replace("under-waterline-", ""),
      );
      const state: GameState = {
        ...bareRunner(),
        flags: {
          [UNDER_WATERLINE_STAGE_FLAG]: stage,
          ...(outcome ? { [outcome.flag]: true } : {}),
        },
      };
      const offered = availableChoices(state, hub)
        .filter((p) => p.enabled)
        .map((p) => p.choice);
      const target = hubDoors[stage];
      if (target) {
        expect(offered.map((c) => c.target), stage).toContain(target);
      }
      // Whether or not the hub has a door, the platform on the map does.
      const platform = dressMap(quays, state.flags).interactables.find(
        (i) => i.id === "quays-diver",
      );
      expect(platform?.interaction.kind, stage).toBe("dialogue");
      // And the job is never offered twice.
      expect(offered.map((c) => c.id), stage).not.toContain("uw-help");
      expect(offered.map((c) => c.id), stage).not.toContain("uw-sell-out");
    }
    // The one stage with no hub door is the one where she is gone.
    expect(
      UNDER_WATERLINE_STAGES.filter((stage) => !hubDoors[stage]),
    ).toEqual(["abandoned"]);
  });
});

describe("the chain's three settlements", () => {
  /** Straight to the fork on the diver's road, taking the free way in. */
  const TO_THE_FORK = ["uw-help", "uw-taken-go", "uw-force"];

  it("pays each settlement exactly what it declares, and only it", () => {
    const cases = [
      { key: "broken", route: [...TO_THE_FORK, "uw-break", "uw-broken-done"] },
      {
        key: "partner",
        route: [...TO_THE_FORK, "uw-terms", "uw-partner-done"],
      },
      {
        key: "abandoned",
        route: ["uw-sell-out", "uw-sell-licence", "uw-abandoned-done"],
      },
    ] as const;
    for (const { key, route } of cases) {
      const outcome = UNDER_WATERLINE_OUTCOMES[key];
      // The silent-partner road needs a cool head; the other two do not.
      const start = key === "partner" ? capableRunner() : bareRunner();
      const state = playRoute(start, "uw-ask", [...route]);
      expect(state.flags[outcome.flag], key).toBe(true);
      expect(state.flags[UNDER_WATERLINE_STAGE_FLAG], key).toBe(key);
      expect(settlements(state), key).toEqual([outcome.flag]);
      expect(state.credits, key).toBe(start.credits + outcome.credits);
      for (const itemId of outcome.items) {
        expect(countItem(state.inventory, itemId), itemId).toBe(1);
      }
      // And nothing another settlement pays out came with it.
      for (const other of Object.values(UNDER_WATERLINE_OUTCOMES)) {
        if (other.flag === outcome.flag) continue;
        for (const itemId of other.items) {
          expect(countItem(state.inventory, itemId), `${key}/${itemId}`).toBe(0);
        }
      }
    }
  });

  it("makes the three roads materially different, not three labels", () => {
    const outcomes = Object.values(UNDER_WATERLINE_OUTCOMES);
    expect(new Set(outcomes.map((o) => o.flag)).size).toBe(3);
    expect(new Set(outcomes.map((o) => o.credits)).size).toBe(3);
    const items: string[] = outcomes.flatMap((o) => [...o.items]);
    expect(new Set(items).size, "two settlements pay the same thing").toBe(
      items.length,
    );
    // Every declared reward resolves to a real item.
    for (const itemId of items) {
      expect(getItem(itemId), itemId).toBeDefined();
    }
    // Each of them is this chain's alone — nothing else in the district
    // hands one out, and each comes from exactly one choice.
    const sources = quaysArc.nodes.flatMap((node) =>
      node.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "add-item" && items.includes(effect.itemId)
            ? [`${effect.itemId}@${node.id}/${choice.id}`]
            : [],
        ),
      ),
    );
    expect(sources.sort()).toEqual([
      "msc-basin-licence@uw-sell/uw-sell-licence",
      "msc-longshore-ledger@uw-inside/uw-break",
      "out-tender-coat@uw-inside/uw-terms",
    ]);
  });

  it("declares a standing swing per faction for the reputation task", () => {
    // The reputation system is later work; this is the contract it
    // reads, keyed the same way the market's chain keys it. Each
    // settlement names its own flag and what it is worth to whom.
    const outcomes = Object.values(UNDER_WATERLINE_OUTCOMES);
    const factions = ["auric", "court", "market"] as const;
    for (const outcome of outcomes) {
      expect(Object.keys(outcome.standing).sort()).toEqual([...factions]);
    }
    // No settlement dominates another: each is the best of the three
    // for exactly one party, so the fork is a choice rather than a
    // ranking with flavour text on it.
    const winners = factions.map((faction) => {
      const best = Math.max(...outcomes.map((o) => o.standing[faction]));
      return outcomes.filter((o) => o.standing[faction] === best);
    });
    for (const [index, tied] of winners.entries()) {
      expect(tied.length, `${factions[index]} has no clear best road`).toBe(1);
    }
    expect(new Set(winners.map(([o]) => o!.flag)).size).toBe(3);
    // The flags named there are the terminals the chain writes, and the
    // only booleans it writes at all.
    const written = new Set(
      allChoices.flatMap(({ choice }) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "set-flag" && effect.value === true
            ? [effect.key]
            : [],
        ),
      ),
    );
    expect([...written].sort()).toEqual(outcomes.map((o) => o.flag).sort());
  });

  it("pays each settlement once, however often the player comes back", () => {
    const start = bareRunner();
    const state = playRoute(start, "uw-ask", [
      "uw-help",
      "uw-taken-go",
      "uw-force",
      "uw-break",
      "uw-broken-done",
    ]);
    const fork = nodesById.get("uw-inside")!;
    // The fork is closed afterwards: both its roads gate on the stage
    // being "inside", and taking either moves the stage off it.
    const offered = availableChoices(state, fork)
      .filter((p) => p.enabled)
      .map((p) => p.choice.id);
    expect(offered).not.toContain("uw-break");
    expect(offered).not.toContain("uw-terms");
    for (const choiceId of ["uw-break", "uw-terms"]) {
      expect(() => applyChoice(state, fork, choiceId), choiceId).toThrow(
        NarrativeError,
      );
    }
    // Which is what keeps the money and the book from doubling.
    expect(state.credits).toBe(
      start.credits + UNDER_WATERLINE_OUTCOMES.broken.credits,
    );
    expect(countItem(state.inventory, "msc-longshore-ledger")).toBe(1);
    // And the way back in from the platform is an account, not the fork.
    const returned = playRoute(state, "uw-ask", [
      "uw-account-broken",
      "uw-broken-go",
    ]);
    expect(returned.credits).toBe(state.credits);
    expect(countItem(returned.inventory, "msc-longshore-ledger")).toBe(1);
  });

  it("closes the other road for good once one is taken", () => {
    // Sell her and the help is gone; help her and the sale is gone. The
    // two are the same gate read from either side.
    const sold = playRoute(bareRunner(), "uw-ask", ["uw-sell-out"]);
    const helped = playRoute(bareRunner(), "uw-ask", ["uw-help"]);
    const hub = nodesById.get("uw-ask")!;
    for (const [state, gone] of [
      [sold, "uw-help"],
      [helped, "uw-sell-out"],
    ] as const) {
      const offered = availableChoices(state, hub).map((p) => p.choice.id);
      expect(offered).not.toContain(gone);
      expect(() => applyChoice(state, hub, gone)).toThrow(NarrativeError);
    }
  });

  it("leaves a different person on the platform for each settlement", () => {
    const quays = requireMap("flooded-quays");
    const before = quays.interactables.find((i) => i.id === "quays-diver");
    expect(before?.interaction).toEqual({
      kind: "dialogue",
      nodeId: "fq-diver",
    });
    for (const outcome of Object.values(UNDER_WATERLINE_OUTCOMES)) {
      const dressed = dressMap(quays, { [outcome.flag]: true });
      const platform = dressed.interactables.find((i) => i.id === "quays-diver");
      expect(platform?.label, outcome.flag).toBe(outcome.platform.label);
      expect(platform?.interaction, outcome.flag).toEqual({
        kind: "dialogue",
        nodeId: outcome.platform.nodeId,
      });
      // The node it opens is a real beat of this chain.
      expect(nodesById.has(outcome.platform.nodeId), outcome.flag).toBe(true);
    }
    // Break the ring and she is still the diver; sell her and she is
    // not there at all.
    expect(UNDER_WATERLINE_OUTCOMES.broken.platform.label).toBe("Dredge");
    expect(UNDER_WATERLINE_OUTCOMES.partner.platform.label).toBe("Dredge");
    expect(UNDER_WATERLINE_OUTCOMES.abandoned.platform.label).toBe("Keel");
  });

  it("hands the district's own conversation back where she is still there", () => {
    // The two roads that leave her on the platform leave the rest of the
    // quays intact behind her; the one that does not, does not.
    for (const key of ["broken", "partner"] as const) {
      const node = nodesById.get(
        UNDER_WATERLINE_OUTCOMES[key].platform.nodeId,
      )!;
      expect(node.choices.map((c) => c.target), key).toContain("fq-diver");
    }
    const gone = nodesById.get(
      UNDER_WATERLINE_OUTCOMES.abandoned.platform.nodeId,
    )!;
    expect(gone.choices.flatMap((c) => c.target ?? [])).toEqual([]);
    expect(gone.speaker).toBe("Keel");
  });
});

describe("the chain's companions", () => {
  it("gives both companions something to say in every scene", () => {
    for (const nodeId of SCENES) {
      const node = nodesById.get(nodeId)!;
      const speakers = new Set((node.comments ?? []).map((c) => c.companionId));
      expect([...speakers].sort(), nodeId).toEqual(["sill", "vesper"]);
    }
  });

  it("shows whichever companion is actually walking with the player", () => {
    const alone = bareRunner();
    const withKade: GameState = {
      ...alone,
      party: recruitCompanion(alone.party, "vesper"),
    };
    const withSill: GameState = {
      ...alone,
      party: recruitCompanion(alone.party, "sill"),
    };
    for (const nodeId of SCENES) {
      const node = nodesById.get(nodeId)!;
      expect(companionAside(node, alone), nodeId).toBeNull();
      expect(companionAside(node, withKade)?.companionId, nodeId).toBe("vesper");
      expect(companionAside(node, withSill)?.companionId, nodeId).toBe("sill");
    }
  });

  it("acknowledges a Kade recruited on this same strand", () => {
    // Flag-gated on the recruitment itself, not on the party, so the
    // chain remembers her whether or not she came down tonight.
    const hub = nodesById.get("uw-ask")!;
    const stranger = bareRunner();
    expect(
      availableChoices(stranger, hub).map((p) => p.choice.id),
    ).not.toContain("uw-ask-kade");
    for (const joined of ["assisted", "pressed"]) {
      const state: GameState = {
        ...stranger,
        flags: { "vesper-joined": joined },
      };
      expect(
        availableChoices(state, hub)
          .filter((p) => p.enabled)
          .map((p) => p.choice.id),
        joined,
      ).toContain("uw-ask-kade");
      // And with her actually there, the aside she throws in is the one
      // written for how she came aboard — a different line for the hand
      // on the winch and for the forty credits.
      const crewed: GameState = {
        ...state,
        party: recruitCompanion(state.party, "vesper"),
      };
      const variant = nodesById
        .get("uw-kade-water")!
        .comments!.find((comment) =>
          (comment.requirements ?? []).some(
            (requirement) =>
              requirement.type === "flag-equals" &&
              requirement.key === "vesper-joined" &&
              requirement.value === joined,
          ),
        );
      expect(variant, joined).toBeDefined();
      const aside = companionAside(nodesById.get("uw-kade-water")!, crewed);
      expect(aside?.companionId, joined).toBe("vesper");
      expect(aside?.text, joined).toBe(variant?.text);
    }
    // The two variants really are different lines, not one line twice.
    const texts = nodesById
      .get("uw-kade-water")!
      .comments!.map((comment) => comment.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("tags the fork as the kind of act it is, so each reads it their own way", () => {
    // Drowning a smuggler's warehouse with his own book under your coat
    // is getting it on the record and telling him where to go; taking a
    // share of it is getting there on a lie; and so is selling her.
    expect(requireChoice("uw-inside", "uw-break").reactions).toEqual([
      "record",
      "defiance",
    ]);
    expect(requireChoice("uw-inside", "uw-terms").reactions).toEqual([
      "deception",
    ]);
    expect(requireChoice("uw-ask", "uw-help").reactions).toEqual(["mercy"]);
    expect(requireChoice("uw-ask", "uw-sell-out").reactions).toEqual([
      "deception",
    ]);
  });
});

/**
 * What a player has on them by the time they are taking side work off
 * the salvage platform: gear off the last chapter and somebody walking
 * with them. The drowned store is mid-game content, and the walkthrough
 * below is only honest if it is played by somebody who could plausibly
 * be standing on that bank.
 */
const kittedOut: RouteStep = {
  kind: "do",
  run(state) {
    let inventory = addItem(state.inventory, "wpn-rail-spitter");
    inventory = addItem(inventory, "out-cordon-plate");
    let loadout = equip(state.player, inventory, "wpn-rail-spitter");
    loadout = equip(loadout.character, loadout.inventory, "out-cordon-plate");
    return {
      ...state,
      player: loadout.character,
      inventory: loadout.inventory,
      party: recruitCompanion(state.party, "vesper"),
    };
  },
};

describe("under the waterline, played end to end", () => {
  it("takes the store's door off its hinges and puts the ring on the bottom", () => {
    // The one route with a real fight in it, autoplayed through the
    // combat engine: proof the staged encounter actually resolves and
    // hands the scene back to the chain.
    const { state } = findRouteSeed(
      (seed) =>
        makeState(
          "gutter-courier",
          (a) => {
            a.body += 5;
            a.reflexes += 4;
            a.tech += 3;
            a.intelligence += 3;
          },
          seed,
        ),
      [
        kittedOut,
        {
          kind: "arc",
          arc: quaysArc,
          entry: "fq-diver",
          choices: [
            "the-store",
            "uw-ask-what",
            "uw-squeeze-back",
            "uw-help",
            "uw-taken-go",
            "uw-force",
            "uw-break",
            "uw-broken-done",
          ],
        },
      ],
    );
    expect(state.flags["under-waterline-side"]).toBe("diver");
    expect(state.flags["under-waterline-entry"]).toBe("fought");
    expect(state.flags["under-waterline-broken"]).toBe(true);
    expect(state.flags["under-waterline-partner"]).toBeUndefined();
    expect(state.flags["under-waterline-abandoned"]).toBeUndefined();
    expect(countItem(state.inventory, "msc-longshore-ledger")).toBe(1);
  });

  it("goes down the tube on gills and comes out a silent partner", () => {
    const state = playRoute(capableRunner(), "uw-ask", [
      "uw-help",
      "uw-taken-go",
      "uw-dive-gills",
      "uw-terms",
      "uw-partner-done",
    ]);
    expect(state.flags["under-waterline-entry"]).toBe("dived");
    expect(state.flags["under-waterline-partner"]).toBe(true);
    expect(countItem(state.inventory, "out-tender-coat")).toBe(1);
  });

  it("keeps the container route shut to a player who never opened the cage", () => {
    // The consignment number is the district task's cage, cashed in;
    // without it the delivery road is not merely disabled, it is not
    // offered at all.
    const state = playRoute(bareRunner(), "uw-ask", ["uw-help", "uw-taken-go"]);
    const ring = nodesById.get("uw-ring")!;
    const offered = availableChoices(state, ring).map((p) => p.choice.id);
    expect(offered).not.toContain("uw-manifest");
    expect(offered).toContain("uw-force");
    expect(() => applyChoice(state, ring, "uw-manifest")).toThrow(
      NarrativeError,
    );
  });
});
