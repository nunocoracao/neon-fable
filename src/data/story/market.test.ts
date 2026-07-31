import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import { applyChoice, companionAside } from "../../narrative";
import {
  activeMember,
  createNewGame,
  getMember,
  recruitCompanion,
  type GameState,
} from "../../state";
import { getEncounter } from "../encounters";
import { HUB_MAP_ID, requireMap } from "../maps";
import { storyArcs } from "./index";
import { marketArc } from "./market";

/**
 * Content-shape assertions for the Vertical Market district. Graph
 * soundness is covered by validate.test.ts over every registered arc and
 * the map itself by the lint in ../maps.test.ts; what is pinned here is
 * the district's wiring — both ways through the door, every fixture on
 * the boards reachable in dialogue as well as on foot, and the promise
 * this arc makes to later work: it stages an arena and touches nothing
 * the acts read.
 */

const nodesById = new Map(marketArc.nodes.map((node) => [node.id, node]));
const allChoices = marketArc.nodes.flatMap((node) =>
  node.choices.map((choice) => ({ nodeId: node.id, choice })),
);

/**
 * The district's own nodes: everything on the boards, minus the side
 * chain Marrow's stool opens. "The Last Mile" is authored in
 * ./lastMile.ts and spread into this arc (a choice target only resolves
 * inside one arc), and it is the one thing here that writes story
 * state, starts a fight, and hands items out. Its own promises are
 * pinned in ./lastMile.test.ts; the assertions below are about the
 * colour the district keeps when the chain is not being played.
 */
const districtChoices = allChoices.filter(
  ({ nodeId }) => !nodeId.startsWith("lm-"),
);

const travelChoices = allChoices.flatMap(({ nodeId, choice }) =>
  (choice.effects ?? []).flatMap((effect) =>
    effect.type === "travel" ? [{ nodeId, mapId: effect.mapId }] : [],
  ),
);

describe("vertical market arc", () => {
  it("is registered so map interactions can find its nodes", () => {
    expect(storyArcs).toContain(marketArc);
  });

  it("walks both ways: the hub gate up, the Cinderway stair back down", () => {
    expect(travelChoices).toEqual([
      { nodeId: "vm-gate", mapId: "vertical-market" },
      { nodeId: "vm-stair", mapId: "cinder-plaza" },
    ]);
  });

  it("hangs the gate on the hub and the stair on the market, each an exit", () => {
    const hub = requireMap(HUB_MAP_ID);
    const gate = hub.interactables.find((i) => i.id === "market-gate");
    expect(gate?.interaction).toEqual({
      kind: "dialogue",
      nodeId: marketArc.entryNodeId,
    });
    expect(gate?.exit).toEqual({ mapId: "vertical-market" });

    const market = requireMap("vertical-market");
    const stair = market.interactables.find((i) => i.id === "market-stair");
    expect(stair?.interaction).toEqual({ kind: "dialogue", nodeId: "vm-stair" });
    expect(stair?.exit).toEqual({ mapId: "cinder-plaza", entryId: "south-road" });
  });

  it("opens every fixture on the boards from the arrival beat too", () => {
    // Each of the market's interactables opens a node of this arc, and
    // the arrival beat offers the same three by name — so a player who
    // rode the dialogue in never has to guess what is worth walking to.
    const market = requireMap("vertical-market");
    const opened = market.interactables.map((i) =>
      i.interaction.kind === "dialogue" ? i.interaction.nodeId : "",
    );
    expect(opened.sort()).toEqual([
      "vm-auditor",
      "vm-broker",
      "vm-fixer",
      "vm-stair",
      "vm-stash",
    ]);
    const arrivalTargets = (nodesById.get("vm-arrival")?.choices ?? []).flatMap(
      (choice) => (choice.target ? [choice.target] : []),
    );
    expect(arrivalTargets.sort()).toEqual([
      "vm-auditor",
      "vm-broker",
      "vm-fixer",
      "vm-stair",
      "vm-stash",
    ]);
  });

  it("keeps its colour self-contained: no act flags, no combat, no items out", () => {
    // The broker's board is still later work. Off the chain, this arc
    // may only leave `market-known` behind, the locker's own record of
    // how it was opened, and Deacon Sill's — how he was met, whether he
    // came, and whether he was turned down. Nothing an act reads.
    const flags = districtChoices.flatMap(({ choice }) =>
      (choice.effects ?? []).flatMap((effect) =>
        effect.type === "set-flag" || effect.type === "increment-flag"
          ? [effect.key]
          : [],
      ),
    );
    expect([...new Set(flags)].sort()).toEqual([
      "market-known",
      "market-locker",
      "sill-declined",
      "sill-joined",
      "sill-met",
    ]);
    for (const { choice } of districtChoices) {
      for (const effect of choice.effects ?? []) {
        expect(effect.type, `${choice.id}`).not.toBe("start-combat");
        expect(effect.type, `${choice.id}`).not.toBe("remove-item");
      }
      for (const requirement of choice.requirements ?? []) {
        // Gating is on the character — a stat or where they came from —
        // never on story state, so the district plays the same in every
        // act and on a fresh run.
        expect(["stat", "background"], `${choice.id}`).toContain(
          requirement.type,
        );
      }
    }
  });

  it("pays the locker out only to a character who can open it", () => {
    const locker = nodesById.get("vm-stash");
    const paying = (locker?.choices ?? []).filter(({ effects }) =>
      (effects ?? []).some((effect) => effect.type === "add-item"),
    );
    expect(paying.map((choice) => choice.id)).toEqual(["force", "pick"]);
    for (const choice of paying) {
      expect(choice.requirements?.length, choice.id).toBe(1);
      expect(choice.ifUnavailable, choice.id).toBe("disabled");
      expect(choice.target, choice.id).toBe("vm-stash-open");
    }
    // And there is always a way to walk away from it.
    expect(
      (locker?.choices ?? []).some((choice) =>
        (choice.effects ?? []).some((effect) => effect.type === "end"),
      ),
    ).toBe(true);
  });

  it("never traps the player on a node", () => {
    for (const node of marketArc.nodes) {
      const canEnd = node.choices.some((choice) =>
        (choice.effects ?? []).some(
          (effect) => effect.type === "end" || effect.type === "travel",
        ),
      );
      const canMoveOn = node.choices.some((choice) => choice.target);
      expect(canEnd || canMoveOn, `node ${node.id} traps the player`).toBe(true);
    }
  });
});

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

function freshRunner(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 21 });
}

describe("Deacon Sill's recruitment", () => {
  it("is reachable on foot and from the arrival beat alike", () => {
    const market = requireMap("vertical-market");
    const npc = market.interactables.find((i) => i.id === "market-auditor");
    expect(npc?.interaction).toEqual({ kind: "dialogue", nodeId: "vm-auditor" });
    expect(
      (nodesById.get("vm-arrival")?.choices ?? []).some(
        (choice) => choice.target === "vm-auditor",
      ),
    ).toBe(true);
  });

  it("takes the witness aboard, and remembers being believed", () => {
    const state = playRoute(freshRunner(), "vm-auditor", [
      "sill-give",
      "witness-on",
      "join-yes",
    ]);
    const member = getMember(state.party, "sill")!;
    expect(member.recruited).toBe(true);
    expect(member.active).toBe(true);
    expect(member.loyalty).toBe(2);
    expect(state.flags["sill-met"]).toBe("witnessed");
    expect(state.flags["sill-joined"]).toBe("witnessed");
  });

  it("takes the retainer aboard, and remembers being bought", () => {
    const state = playRoute(freshRunner(), "vm-auditor", [
      "sill-price",
      "price-take",
      "terms-yes",
    ]);
    const member = getMember(state.party, "sill")!;
    expect(member.recruited).toBe(true);
    // Same companion, same kit — a different opening standing, which is
    // the whole point of the fork.
    expect(member.loyalty).toBe(-1);
    expect(state.flags["sill-joined"]).toBe("priced");
  });

  it("lets the player walk away from both roads without him", () => {
    for (const route of [
      ["sill-give", "witness-on", "join-no"],
      ["sill-price", "price-take", "terms-no"],
      ["sill-leave"],
    ]) {
      const state = playRoute(freshRunner(), "vm-auditor", route);
      expect(getMember(state.party, "sill"), route.join(">")).toBeUndefined();
    }
  });

  it("benches whoever was already walking with the player", () => {
    const crewed: GameState = {
      ...freshRunner(),
      party: recruitCompanion(freshRunner().party, "vesper"),
    };
    const state = playRoute(crewed, "vm-auditor", [
      "sill-give",
      "witness-on",
      "join-yes",
    ]);
    expect(activeMember(state.party)?.companionId).toBe("sill");
    // Stepped back, not dropped: she is still in the party to switch to.
    expect(getMember(state.party, "vesper")!.recruited).toBe(true);
    expect(getMember(state.party, "vesper")!.active).toBe(false);
  });

  it("gives Kade something to say about the man in the tower suit", () => {
    const meeting = nodesById.get("vm-auditor")!;
    const alone = freshRunner();
    const crewed: GameState = {
      ...alone,
      party: recruitCompanion(alone.party, "vesper"),
    };
    expect(companionAside(meeting, alone)).toBeNull();
    expect(companionAside(meeting, crewed)?.companionId).toBe("vesper");
  });

  it("does not read a companion, so his pitch plays the same alone", () => {
    // He is the second companion, not the second half of the first:
    // nothing in his chain gates on who else is with you.
    const auditorNodes = marketArc.nodes.filter((node) =>
      node.id.startsWith("vm-auditor"),
    );
    for (const node of auditorNodes) {
      for (const choice of node.choices) {
        for (const requirement of choice.requirements ?? []) {
          expect(requirement.type, `${node.id}/${choice.id}`).not.toBe(
            "companion",
          );
        }
      }
    }
  });
});

describe("the market's staged encounter", () => {
  it("fights on the district's own arena, from the chain and nowhere else", () => {
    const encounter = getEncounter("enc-market-scaffold");
    expect(encounter?.arenaMapId).toBe("market-scaffold-arena");
    const starters = storyArcs.flatMap((arc) =>
      arc.nodes.flatMap((node) =>
        node.choices.flatMap((choice) =>
          (choice.effects ?? []).flatMap((effect) =>
            effect.type === "start-combat" &&
            effect.encounterId === "enc-market-scaffold"
              ? [`${node.id}/${choice.id}`]
              : [],
          ),
        ),
      ),
    );
    // Staged ahead of its beat by the district task; "The Last Mile" is
    // that beat. One choice in the game starts it — the Rung on the
    // stair-head — and the district's own nodes still start nothing.
    expect(starters).toEqual(["lm-scaffold/lm-fight"]);
  });
});
