import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../../character/testSupport";
import {
  applyChoice,
  availableChoices,
  personalSceneReady,
  type StoryNode,
} from "../../narrative";
import {
  adjustLoyalty,
  createNewGame,
  getMember,
  recruitCompanion,
  setActiveCompanion,
  type GameState,
} from "../../state";
import { getCompanion } from "../companions";
import { epilogueVignettes } from "../epilogues";
import { act2Arc } from "./act2";
import { companionsArc } from "./companions";
import { findArcByNode, storyArcs } from "./index";

/**
 * The crew arc, and the beat in Act 2 that decides it. What is pinned
 * here is the wiring between content and rule: the hub's gates are the
 * same three conditions personalSceneReady checks, each fork writes the
 * bond flag the endings read, and the vault call moves the two
 * loyalties in opposite directions.
 */

const VESPER = getCompanion("vesper")!;
const SILL = getCompanion("sill")!;

const nodesById = new Map(
  [...companionsArc.nodes, ...act2Arc.nodes].map((node) => [node.id, node]),
);

function node(id: string): StoryNode {
  const found = nodesById.get(id);
  if (!found) throw new Error(`no node "${id}"`);
  return found;
}

function freshState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 17 });
}

/** The named companions recruited, `active` out, and their loyalty set. */
function crew(
  active: string | null,
  loyalties: Record<string, number> = {},
): GameState {
  const state = freshState();
  let party = state.party;
  for (const id of Object.keys(loyalties)) party = recruitCompanion(party, id);
  for (const [id, loyalty] of Object.entries(loyalties)) {
    party = adjustLoyalty(party, id, loyalty);
  }
  return { ...state, party: setActiveCompanion(party, active) };
}

function playRoute(
  start: GameState,
  entryNodeId: string,
  choiceIds: string[],
): GameState {
  let state = start;
  let nodeId: string | null = entryNodeId;
  for (const choiceId of choiceIds) {
    const outcome = applyChoice(state, node(nodeId ?? ""), choiceId);
    state = outcome.state;
    nodeId = outcome.nextNodeId;
  }
  return state;
}

/** The choice ids a player could actually take on a node right now. */
function choiceIds(state: GameState, nodeId: string): string[] {
  return availableChoices(state, node(nodeId))
    .filter((presented) => presented.enabled)
    .map((presented) => presented.choice.id);
}

describe("the crew arc", () => {
  it("is registered so the party screen can open it", () => {
    expect(storyArcs).toContain(companionsArc);
    expect(findArcByNode(companionsArc.entryNodeId)).toBe(companionsArc);
  });

  it("gives every companion a scene the arc actually contains", () => {
    for (const companion of [VESPER, SILL]) {
      const scene = companion.personalScene;
      expect(findArcByNode(scene.nodeId), companion.id).toBe(companionsArc);
    }
  });

  it("gates the hub on exactly what personalSceneReady checks", () => {
    // Three conditions, declared twice — once in content, once in code.
    // If they ever drift, a scene is offered that cannot be played (or
    // the other way round), so they are pinned against each other.
    for (const companion of [VESPER, SILL]) {
      const choice = node("cmp-hub").choices.find(
        (c) => c.target === companion.personalScene.nodeId,
      );
      expect(choice?.requirements, companion.id).toEqual([
        { type: "companion", companionId: companion.id },
        {
          type: "loyalty",
          companionId: companion.id,
          value: companion.personalScene.loyalty,
        },
        { type: "flag-unset", key: companion.personalScene.resolvedFlag },
      ]);
    }
  });

  it("offers nothing to a player walking alone", () => {
    expect(choiceIds(freshState(), "cmp-hub")).toEqual(["hub-leave"]);
  });

  it("opens a scene only once its companion has decided about you", () => {
    const below = crew("vesper", { vesper: VESPER.personalScene.loyalty - 1 });
    expect(choiceIds(below, "cmp-hub")).toEqual(["hub-leave"]);
    expect(personalSceneReady(below, "vesper")).toBe(false);

    const ready = crew("vesper", { vesper: VESPER.personalScene.loyalty });
    expect(choiceIds(ready, "cmp-hub")).toEqual(["hear-vesper", "hub-leave"]);
    expect(personalSceneReady(ready, "vesper")).toBe(true);
  });

  it("offers only the companion who is actually out with you", () => {
    const both = { vesper: 6, sill: 6 };
    expect(choiceIds(crew("sill", both), "cmp-hub")).toEqual([
      "hear-sill",
      "hub-leave",
    ]);
    expect(choiceIds(crew("vesper", both), "cmp-hub")).toEqual([
      "hear-vesper",
      "hub-leave",
    ]);
    expect(choiceIds(crew(null, both), "cmp-hub")).toEqual(["hub-leave"]);
  });

  it("closes for good once the conversation has been had", () => {
    const ready = crew("sill", { sill: 6 });
    const after = playRoute(ready, "cmp-hub", ["hear-sill", "sill-why", "sill-name"]);
    expect(choiceIds(after, "cmp-hub")).toEqual(["hub-leave"]);
    expect(personalSceneReady(after, "sill")).toBe(false);
  });

  it("locks each companion's state on the fork, both ways", () => {
    const scenes = [
      {
        companion: VESPER,
        open: "hear-vesper",
        on: "vesper-why",
        sworn: "vesper-sign",
        parted: "vesper-decline",
      },
      {
        companion: SILL,
        open: "hear-sill",
        on: "sill-why",
        sworn: "sill-name",
        parted: "sill-anon",
      },
    ];
    for (const scene of scenes) {
      const id = scene.companion.id;
      const start = crew(id, { [id]: 6 });
      const flag = scene.companion.personalScene.resolvedFlag;

      const sworn = playRoute(start, "cmp-hub", [scene.open, scene.on, scene.sworn]);
      expect(sworn.flags[flag], id).toBe("sworn");
      expect(getMember(sworn.party, id)!.loyalty, id).toBe(9);

      const parted = playRoute(start, "cmp-hub", [scene.open, scene.on, scene.parted]);
      expect(parted.flags[flag], id).toBe("parted");
      expect(getMember(parted.party, id)!.loyalty, id).toBe(3);
      // Parting is not a sacking: they are still at your shoulder.
      expect(getMember(parted.party, id)!.recruited, id).toBe(true);
      expect(getMember(parted.party, id)!.active, id).toBe(true);
    }
  });

  it("moves loyalty by name here, never by reaction tag", () => {
    // These scenes are about one specific person, which is exactly when
    // a companion-loyalty effect is the right tool and a tag is not.
    for (const arcNode of companionsArc.nodes) {
      for (const choice of arcNode.choices) {
        expect(choice.reactions, `${arcNode.id}/${choice.id}`).toBeUndefined();
      }
    }
  });

  it("writes nothing but the two bond flags", () => {
    const flags = companionsArc.nodes.flatMap((arcNode) =>
      arcNode.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "set-flag" || effect.type === "increment-flag"
            ? [effect.key]
            : [],
        ),
      ),
    );
    expect([...new Set(flags)].sort()).toEqual(["sill-bond", "vesper-bond"]);
  });
});

describe("the coolant vault call", () => {
  it("only comes up with both of them aboard", () => {
    const gate = node("a2-vent-loot").choices.find((c) => c.id === "crew-split");
    expect(gate?.target).toBe("a2-vent-split");
    expect(gate?.requirements).toEqual([
      { type: "companion", companionId: "vesper", status: "recruited" },
      { type: "companion", companionId: "sill", status: "recruited" },
    ]);
    // Recruited, not active: the one on the bench came anyway.
    expect(choiceIds(crew("vesper", { vesper: 0 }), "a2-vent-loot")).not.toContain(
      "crew-split",
    );
    expect(
      choiceIds(crew("vesper", { vesper: 0, sill: 0 }), "a2-vent-loot"),
    ).toContain("crew-split");
  });

  it("shifts both loyalties in opposite directions", () => {
    const start = crew("vesper", { vesper: 2, sill: 2 });
    const stripped = playRoute(start, "a2-vent-split", ["split-strip"]);
    expect(getMember(stripped.party, "vesper")!.loyalty).toBe(5);
    expect(getMember(stripped.party, "sill")!.loyalty).toBe(-1);

    const filed = playRoute(start, "a2-vent-split", ["split-file"]);
    expect(getMember(filed.party, "vesper")!.loyalty).toBe(-1);
    expect(getMember(filed.party, "sill")!.loyalty).toBe(5);
  });

  it("pays a broker the same coin from both of them, behind a steep gate", () => {
    const start = crew("sill", { vesper: 2, sill: 2 });
    // Not takeable by a character who cannot hold the room — but shown
    // greyed out, so the player can see what a colder head would buy.
    expect(choiceIds(start, "a2-vent-split")).toEqual([
      "split-strip",
      "split-file",
    ]);
    expect(
      availableChoices(start, node("a2-vent-split")).map((p) => [
        p.choice.id,
        p.enabled,
      ]),
    ).toContainEqual(["split-broker", false]);

    const cool: GameState = {
      ...start,
      player: {
        ...start.player,
        stats: { ...start.player.stats, cool: 8 },
      },
    };
    expect(choiceIds(cool, "a2-vent-split")).toContain("split-broker");
    const brokered = playRoute(cool, "a2-vent-split", ["split-broker"]);
    expect(getMember(brokered.party, "vesper")!.loyalty).toBe(3);
    expect(getMember(brokered.party, "sill")!.loyalty).toBe(3);
  });

  it("records the call as a flag the endings can read", () => {
    const start = crew("vesper", { vesper: 2, sill: 2 });
    const calls = ["split-strip", "split-file"].map(
      (choice) => playRoute(start, "a2-vent-split", [choice]).flags["vent-vault-call"],
    );
    expect(calls).toEqual(["salvage", "filed"]);
  });

  it("leaves every road back into the chapter", () => {
    for (const id of [
      "a2-vent-split-strip",
      "a2-vent-split-file",
      "a2-vent-split-both",
    ]) {
      expect(node(id).choices.map((c) => c.target)).toEqual([
        "a2-vent-arrival",
      ]);
    }
  });
});

describe("what the endings do with it", () => {
  it("reads every flag the crew arc and the vault call write", () => {
    const gated = epilogueVignettes.flatMap((vignette) =>
      (vignette.requires ?? []).flatMap((requirement) =>
        requirement.type === "flag-equals" ? [requirement.key] : [],
      ),
    );
    for (const key of ["vesper-bond", "sill-bond", "vent-vault-call"]) {
      expect(gated, `no epilogue reads ${key}`).toContain(key);
    }
  });

  it("keeps a companion out of the epilogue entirely if never met", () => {
    // Every crew vignette is gated, and the loosest gate is "they
    // travelled with you" — so a player who never went to the market
    // never reads a line about the man at the card table.
    const crewVignettes = epilogueVignettes.filter((v) =>
      ["vesper", "sill"].includes(v.subject),
    );
    expect(crewVignettes.length).toBeGreaterThanOrEqual(6);
    for (const vignette of crewVignettes) {
      expect(vignette.requires?.length, vignette.id).toBeGreaterThan(0);
    }
  });
});
