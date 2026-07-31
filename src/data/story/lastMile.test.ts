import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import {
  addItem,
  countItem,
  equip,
  installEnhancement,
} from "../../inventory";
import {
  applyChoice,
  availableChoices,
  companionAside,
  NarrativeError,
} from "../../narrative";
import type { Choice, Requirement } from "../../narrative/types";
import {
  createNewGame,
  recruitCompanion,
  type GameState,
} from "../../state";
import { getItem } from "../items";
import {
  LAST_MILE_OUTCOMES,
  LAST_MILE_STAGES,
  LAST_MILE_STAGE_FLAG,
  lastMileNodes,
  type LastMileStage,
} from "./lastMile";
import { marketArc } from "./market";
import {
  findRouteSeed,
  makeState,
  type RouteStep,
} from "./walkthroughSupport";

/**
 * "The Last Mile" — the Vertical Market's side-quest chain.
 *
 * Graph soundness (targets, reachability, dead ends, unknown ids) is
 * covered for every arc by validate.test.ts, and the district's own
 * wiring by ./market.test.ts. What is pinned here is what makes this a
 * quest rather than a conversation: that every road out of every scene
 * lands somewhere terminal, that the gates are the ones the content
 * claims, that the two endings can never both be true, and that neither
 * of them can be collected twice.
 */

const nodesById = new Map(lastMileNodes.map((node) => [node.id, node]));
const allChoices = lastMileNodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

/** The three scenes, in the order a run passes through them. */
const SCENES = ["lm-trail", "lm-scaffold", "lm-case"] as const;

/** Choices whose availability is the chain's own stage routing. */
const STAGE_ROUTING = new Set([
  "lm-who-wants-it",
  "lm-take-job",
  "lm-resume-trail",
  "lm-resume-scaffold",
  "lm-resume-case",
  "lm-account-paid",
  "lm-account-burned",
  "lm-deliver",
  "lm-expose",
]);

/**
 * Every gate the content claims to have, written out once. A gate that
 * drifts from this table — a stat renamed, a threshold nudged, an optic
 * id changed — fails here rather than silently locking a road.
 */
const DECLARED_GATES: Readonly<Record<string, Requirement[]>> = {
  "lm-trace": [{ type: "stat", stat: "tech", value: 7 }],
  "lm-press": [{ type: "stat", stat: "cool", value: 7 }],
  "lm-optics-suite": [{ type: "enhancement", itemId: "cyb-optic-suite" }],
  "lm-optics-warden": [{ type: "enhancement", itemId: "cyb-warden-optics" }],
  "lm-talk": [{ type: "stat", stat: "cool", value: 8 }],
  "lm-pay": [{ type: "credits", value: 80 }],
  "lm-slip": [{ type: "flag-equals", key: "last-mile-route", value: true }],
};

function isEnd(choice: Choice): boolean {
  return (choice.effects ?? []).some((effect) => effect.type === "end");
}

function requireChoice(nodeId: string, choiceId: string): Choice {
  const choice = nodesById
    .get(nodeId)
    ?.choices.find((c) => c.id === choiceId);
  if (!choice) throw new Error(`no choice "${choiceId}" on "${nodeId}"`);
  return choice;
}

/**
 * A character who can walk every road: Cool 9 and Tech 7 (so the talk
 * gate still passes with an optic's -1 Cool installed), money for the
 * crew, and a set of eyes in the head.
 */
function capableRunner(itemId = "cyb-optic-suite"): GameState {
  const base = makeState(
    "gutter-courier",
    (a) => {
      a.cool += 6;
      a.tech += 4;
      a.reflexes += 3;
      a.body += 2;
    },
    7,
  );
  const inventory = addItem(base.inventory, itemId);
  const loadout = installEnhancement(base.player, inventory, itemId);
  return {
    ...base,
    player: loadout.character,
    inventory: loadout.inventory,
    credits: 400,
  };
}

/** A character with none of it: no stats, no credits, no chrome. */
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

/** One terminal a walk of the chain came to rest on. */
interface Terminal {
  nodeId: string;
  choiceId: string;
  state: GameState;
}

/**
 * Walks every reachable route from `lm-offer` for one character,
 * exhaustively: at each node every choice the engine would actually
 * offer is taken. Revisits of the same node in the same state are
 * pruned (the chain's loops are conversational), so this terminates.
 */
function walkChain(start: GameState): Terminal[] {
  const terminals: Terminal[] = [];
  const seen = new Set<string>();
  const frontier: Array<{ nodeId: string; state: GameState }> = [
    { nodeId: "lm-offer", state: start },
  ];
  let guard = 0;
  while (frontier.length > 0) {
    if (guard++ > 5000) throw new Error("chain walk did not converge");
    const { nodeId, state } = frontier.pop()!;
    const key = `${nodeId}|${JSON.stringify(state.flags)}|${state.credits}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = nodesById.get(nodeId);
    if (!node) throw new Error(`walk left the chain at "${nodeId}"`);
    const offered = availableChoices(state, node).filter((p) => p.enabled);
    expect(offered.length, `node ${nodeId} offers the player nothing`).
      toBeGreaterThan(0);
    for (const { choice } of offered) {
      const outcome = applyChoice(state, node, choice.id);
      if (outcome.nextNodeId === null) {
        terminals.push({
          nodeId,
          choiceId: choice.id,
          state: outcome.state,
        });
        continue;
      }
      frontier.push({ nodeId: outcome.nextNodeId, state: outcome.state });
    }
  }
  return terminals;
}

describe("the last mile chain", () => {
  it("hangs off the market's fixer, and is entered nowhere else", () => {
    const fixer = marketArc.nodes.find((node) => node.id === "vm-fixer");
    expect(fixer?.choices.map((c) => c.target)).toContain("lm-offer");
    // Every other way into the chain is from inside the chain: no map
    // interactable and no other scene short-circuits into the middle.
    const outsideTargets = marketArc.nodes
      .filter((node) => !node.id.startsWith("lm-"))
      .flatMap((node) => node.choices.flatMap((c) => c.target ?? []))
      .filter((target) => target.startsWith("lm-"));
    expect(outsideTargets).toEqual(["lm-offer"]);
  });

  it("runs investigation, then confrontation, then resolution", () => {
    // The spine, as data: each scene is reachable and leads to the next.
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
    expect(reaches("lm-trail", "lm-scaffold")).toBe(true);
    expect(reaches("lm-scaffold", "lm-case")).toBe(true);
    // And the fight in the district's arena is one of the ways through
    // the middle scene, not the only one.
    expect(requireChoice("lm-scaffold", "lm-fight").effects).toContainEqual({
      type: "start-combat",
      encounterId: "enc-market-scaffold",
    });
    const confrontations = nodesById
      .get("lm-scaffold")!
      .choices.filter((c) => c.target === "lm-pell");
    expect(confrontations.map((c) => c.id)).toEqual([
      "lm-talk",
      "lm-pay",
      "lm-slip",
      "lm-fight",
    ]);
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

  it("names optic enhancements that exist, in the one eye slot", () => {
    // The two optic roads are alternatives, not a pair to collect: an
    // eye slot holds one install, so a character can only ever have one
    // of them, and both open the same hidden route.
    for (const itemId of ["cyb-optic-suite", "cyb-warden-optics"]) {
      const item = getItem(itemId);
      expect(item?.kind, itemId).toBe("enhancement");
      if (item?.kind !== "enhancement") continue;
      expect(item.slot, itemId).toBe("eyes");
    }
    expect(requireChoice("lm-trail", "lm-optics-suite").target).toBe(
      "lm-route",
    );
    expect(requireChoice("lm-trail", "lm-optics-warden").target).toBe(
      "lm-route",
    );
  });

  it("quotes the crew's price in the label it charges", () => {
    const pay = requireChoice("lm-scaffold", "lm-pay");
    expect(pay.requirements).toEqual([{ type: "credits", value: 80 }]);
    expect(pay.effects).toContainEqual({ type: "credits", amount: -80 });
    expect(pay.label).toContain("(80 cr)");
  });
});

describe("every road through the chain", () => {
  it("reaches a terminal, for a character who can take them all", () => {
    const terminals = walkChain(capableRunner());
    expect(terminals.length).toBeGreaterThan(0);
    // Every walk ends on an authored end marker — nothing runs off the
    // side of the graph or loops forever.
    for (const terminal of terminals) {
      expect(
        isEnd(requireChoice(terminal.nodeId, terminal.choiceId)),
        `${terminal.nodeId}/${terminal.choiceId}`,
      ).toBe(true);
    }
    // And both endings are among them.
    const stages = new Set(
      terminals.map((t) => t.state.flags[LAST_MILE_STAGE_FLAG]),
    );
    expect(stages).toContain("delivered");
    expect(stages).toContain("exposed");
  });

  it("reaches a terminal for a character with no stats and no money", () => {
    const terminals = walkChain(bareRunner());
    const stages = new Set(
      terminals.map((t) => t.state.flags[LAST_MILE_STAGE_FLAG]),
    );
    // The gated roads are closed to them; the chain still finishes, and
    // still finishes both ways.
    expect(stages).toContain("delivered");
    expect(stages).toContain("exposed");
    for (const terminal of terminals) {
      expect(
        isEnd(requireChoice(terminal.nodeId, terminal.choiceId)),
        `${terminal.nodeId}/${terminal.choiceId}`,
      ).toBe(true);
    }
  });

  it("never lets both endings be true at once", () => {
    for (const start of [capableRunner(), bareRunner()]) {
      for (const terminal of walkChain(start)) {
        const delivered = terminal.state.flags["last-mile-delivered"] === true;
        const exposed = terminal.state.flags["last-mile-exposed"] === true;
        expect(
          delivered && exposed,
          `${terminal.nodeId}/${terminal.choiceId} set both endings`,
        ).toBe(false);
      }
    }
  });

  it("can be walked away from at every single beat", () => {
    // Optional and missable, but never a trap: every node in the chain
    // offers a way out that no requirement can close.
    for (const node of lastMileNodes) {
      const exits = node.choices.filter(
        (choice) => isEnd(choice) && (choice.requirements ?? []).length === 0,
      );
      expect(exits.length, `node ${node.id} cannot be left`).toBeGreaterThan(0);
    }
  });

  it("routes a returning player back to the scene they abandoned", () => {
    // Quest state is the stage flag and nothing else — no log, no
    // bookkeeping — so every stage has to have a door back in.
    const resumes: Record<LastMileStage, string> = {
      taken: "lm-trail",
      found: "lm-scaffold",
      recovered: "lm-case",
      delivered: "lm-settled-paid",
      exposed: "lm-settled-burned",
    };
    // Every stage the chain can be in has a door, including the two it
    // finishes in — a stage list that grows without one fails here.
    expect(Object.keys(resumes).sort()).toEqual([...LAST_MILE_STAGES].sort());
    const offer = nodesById.get("lm-offer")!;
    for (const [stage, target] of Object.entries(resumes)) {
      const state: GameState = {
        ...bareRunner(),
        flags: { [LAST_MILE_STAGE_FLAG]: stage },
      };
      const offered = availableChoices(state, offer)
        .filter((p) => p.enabled)
        .map((p) => p.choice);
      expect(offered.map((c) => c.target), stage).toContain(target);
      // And the job is never offered twice.
      expect(offered.map((c) => c.id), stage).not.toContain("lm-take-job");
    }
  });
});

describe("the chain's two endings", () => {
  /** Straight through to the fork, on the road anybody can walk. */
  const TO_THE_FORK = [
    "lm-take-job",
    "lm-ask-around",
    "lm-lead-go",
    "lm-fight",
    "lm-pell-look",
  ];

  it("pays the delivered ending exactly what it declares", () => {
    const start = bareRunner();
    const state = playRoute(start, "lm-offer", [
      ...TO_THE_FORK,
      "lm-deliver",
      "lm-delivered-done",
    ]);
    const outcome = LAST_MILE_OUTCOMES.delivered;
    expect(state.flags[outcome.flag]).toBe(true);
    expect(state.flags["last-mile-exposed"]).toBeUndefined();
    expect(state.flags[LAST_MILE_STAGE_FLAG]).toBe("delivered");
    expect(state.credits).toBe(start.credits + outcome.credits);
    for (const itemId of outcome.items) {
      expect(countItem(state.inventory, itemId), itemId).toBe(1);
    }
  });

  it("pays the exposed ending exactly what it declares", () => {
    const start = bareRunner();
    const state = playRoute(start, "lm-offer", [
      ...TO_THE_FORK,
      "lm-expose",
      "lm-exposed-done",
    ]);
    const outcome = LAST_MILE_OUTCOMES.exposed;
    expect(state.flags[outcome.flag]).toBe(true);
    expect(state.flags["last-mile-delivered"]).toBeUndefined();
    expect(state.flags[LAST_MILE_STAGE_FLAG]).toBe("exposed");
    expect(state.credits).toBe(start.credits + outcome.credits);
    for (const itemId of outcome.items) {
      expect(countItem(state.inventory, itemId), itemId).toBe(1);
    }
  });

  it("makes the two roads materially different, not two labels", () => {
    const { delivered, exposed } = LAST_MILE_OUTCOMES;
    expect(delivered.flag).not.toBe(exposed.flag);
    expect(delivered.credits).not.toBe(exposed.credits);
    expect([...delivered.items]).not.toEqual([...exposed.items]);
    // Both roads carry the courier's own rig; only one leaves evidence
    // in the player's hands.
    expect(delivered.items).toContain("out-highline-rig");
    expect(exposed.items).toContain("msc-assessment-roll");
    // Every declared reward resolves to a real item.
    for (const itemId of [...delivered.items, ...exposed.items]) {
      expect(getItem(itemId), itemId).toBeDefined();
    }
    // The rig is this chain's alone — nothing else in the game hands
    // it out, so "unique" means unique.
    const sources = marketArc.nodes.flatMap((node) =>
      node.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "add-item" && effect.itemId === "out-highline-rig"
            ? [`${node.id}/${choice.id}`]
            : [],
        ),
      ),
    );
    expect(sources.sort()).toEqual(["lm-case/lm-deliver", "lm-case/lm-expose"]);
  });

  it("declares a standing swing per faction for the reputation task", () => {
    // The reputation system is later work; this is the contract it
    // reads. Each ending names its own flag and what that ending is
    // worth to whom, and the two are opposed rather than a strict
    // upgrade of each other.
    const { delivered, exposed } = LAST_MILE_OUTCOMES;
    expect(Object.keys(delivered.standing).sort()).toEqual([
      "auric",
      "court",
      "market",
    ]);
    expect(Object.keys(exposed.standing)).toEqual(
      Object.keys(delivered.standing),
    );
    const swings = Object.keys(delivered.standing).map((faction) => ({
      faction,
      a: delivered.standing[faction as keyof typeof delivered.standing],
      b: exposed.standing[faction as keyof typeof exposed.standing],
    }));
    // Two parties read the two roads in opposite directions — the buyer
    // and the Court are on opposite sides of whether it stayed sealed.
    expect(
      swings.filter(({ a, b }) => Math.sign(a) !== Math.sign(b)).length,
    ).toBeGreaterThanOrEqual(2);
    // And neither road dominates: each is worth more than the other to
    // somebody, so the fork is a choice rather than a better option.
    expect(swings.some(({ a, b }) => a > b)).toBe(true);
    expect(swings.some(({ a, b }) => b > a)).toBe(true);
    // The flags named there are the terminal flags the chain writes,
    // and the only booleans it writes at all.
    const written = new Set(
      allChoices.flatMap(({ choice }) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "set-flag" && effect.value === true
            ? [effect.key]
            : [],
        ),
      ),
    );
    expect([...written].sort()).toEqual(
      [delivered.flag, exposed.flag, "last-mile-route"].sort(),
    );
  });

  it("pays each ending once, however often the player comes back", () => {
    const start = bareRunner();
    const state = playRoute(start, "lm-offer", [
      ...TO_THE_FORK,
      "lm-deliver",
      "lm-delivered-done",
    ]);
    const fork = nodesById.get("lm-case")!;
    // The fork is closed afterwards: it gates on the stage being
    // "recovered", and taking either road moves the stage off it.
    const offered = availableChoices(state, fork).map((p) => p.choice.id);
    expect(offered).not.toContain("lm-deliver");
    expect(offered).not.toContain("lm-expose");
    expect(() => applyChoice(state, fork, "lm-deliver")).toThrow(
      NarrativeError,
    );
    expect(() => applyChoice(state, fork, "lm-expose")).toThrow(NarrativeError);
    // Which is what keeps the money and the rig from doubling.
    expect(state.credits).toBe(
      start.credits + LAST_MILE_OUTCOMES.delivered.credits,
    );
    expect(countItem(state.inventory, "out-highline-rig")).toBe(1);
    // And the way back in from Marrow is a debrief, not the fork again.
    const returned = playRoute(state, "lm-offer", [
      "lm-account-paid",
      "lm-settled-paid-done",
    ]);
    expect(returned.credits).toBe(state.credits);
    expect(countItem(returned.inventory, "out-highline-rig")).toBe(1);
  });
});

describe("the chain's companions", () => {
  it("gives both companions something to say in every scene", () => {
    for (const nodeId of SCENES) {
      const node = nodesById.get(nodeId)!;
      const speakers = (node.comments ?? []).map((c) => c.companionId);
      expect(speakers.sort(), nodeId).toEqual(["sill", "vesper"]);
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
      expect(companionAside(node, withKade)?.companionId, nodeId).toBe(
        "vesper",
      );
      expect(companionAside(node, withSill)?.companionId, nodeId).toBe("sill");
    }
  });

  it("tags the fork as the kind of act it is, so each reads it their own way", () => {
    // Finishing somebody else's run sealed is procedure; nailing it to
    // the board is getting it on the record and telling Auric where to
    // go. Sill and Kade score those opposite ways without the content
    // naming either of them.
    expect(requireChoice("lm-case", "lm-deliver").reactions).toEqual([
      "procedure",
    ]);
    expect(requireChoice("lm-case", "lm-expose").reactions).toEqual([
      "record",
      "defiance",
    ]);
  });
});

/**
 * What a player has on them by the time they are taking side work off
 * Marrow's stool: somebody out of the Quays walking with them and gear
 * off the last chapter. Scaffold Row is mid-game content, not a
 * starting scrap, and the walkthrough below is only honest if it is
 * played by somebody who could plausibly be standing there.
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

describe("the last mile, played end to end", () => {
  it("fights the Rung on the market's arena and delivers the case", () => {
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
          arc: marketArc,
          entry: "vm-fixer",
          choices: [
            "the-job",
            "lm-who-wants-it",
            "lm-parties-back",
            "lm-take-job",
            "lm-ask-around",
            "lm-lead-go",
            "lm-fight",
            "lm-pell-look",
            "lm-deliver",
            "lm-delivered-done",
          ],
        },
      ],
    );
    expect(state.flags["last-mile-crew"]).toBe("fought");
    expect(state.flags["last-mile-delivered"]).toBe(true);
    expect(state.flags["last-mile-exposed"]).toBeUndefined();
    expect(countItem(state.inventory, "out-highline-rig")).toBe(1);
  });

  it("takes the quiet road when the player has the eyes for it", () => {
    for (const optic of ["cyb-optic-suite", "cyb-warden-optics"]) {
      const state = playRoute(capableRunner(optic), "lm-offer", [
        "lm-take-job",
        optic === "cyb-optic-suite" ? "lm-optics-suite" : "lm-optics-warden",
        "lm-route-on",
        "lm-lead-go",
        "lm-slip",
        "lm-pell-look",
        "lm-expose",
        "lm-exposed-done",
      ]);
      expect(state.flags["last-mile-lead"], optic).toBe("seen");
      expect(state.flags["last-mile-route"], optic).toBe(true);
      expect(state.flags["last-mile-crew"], optic).toBe("slipped");
      expect(state.flags["last-mile-exposed"], optic).toBe(true);
      expect(countItem(state.inventory, "msc-assessment-roll"), optic).toBe(1);
    }
  });

  it("keeps the quiet road shut to a player who never found it", () => {
    // The catwalk is the optics' reward; without it the sneak is not
    // merely disabled, it is not offered at all.
    const state = playRoute(bareRunner(), "lm-offer", [
      "lm-take-job",
      "lm-ask-around",
      "lm-lead-go",
    ]);
    const scaffold = nodesById.get("lm-scaffold")!;
    const offered = availableChoices(state, scaffold).map((p) => p.choice.id);
    expect(offered).not.toContain("lm-slip");
    expect(offered).toContain("lm-fight");
    expect(() => applyChoice(state, scaffold, "lm-slip")).toThrow(
      NarrativeError,
    );
  });
});
