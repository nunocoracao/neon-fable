import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { getCompanion } from "../data/companions";
import {
  adjustLoyalty,
  createNewGame,
  getMember,
  recruitCompanion,
  setActive,
  setActiveCompanion,
  type GameState,
} from "../state";
import { applyChoice } from "./engine";
import {
  applyLoyaltyChanges,
  choiceLoyaltyChanges,
  personalSceneReady,
  reactionChanges,
  reactionTotal,
  readyPersonalScenes,
  witnesses,
} from "./loyalty";
import { checkRequirement } from "./requirements";
import type { StoryNode } from "./types";

/**
 * Loyalty: a choice says what kind of act it is, a companion says what
 * they make of that kind of act, and the two are multiplied out against
 * whoever was standing there. Nothing in this module names a companion;
 * these tests use the shipped two because the axis between them — she
 * takes it, he logs it — is the thing worth pinning.
 */

const VESPER = getCompanion("vesper")!;
const SILL = getCompanion("sill")!;

function freshState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 9 });
}

/** The named companions recruited, with `active` out and the rest benched. */
function crew(active: string | null, ...ids: string[]): GameState {
  const state = freshState();
  let party = state.party;
  for (const id of ids) party = recruitCompanion(party, id);
  return { ...state, party: setActiveCompanion(party, active) };
}

/** A node with one choice carrying the given reaction tags. */
function taggedNode(...reactions: Array<"salvage" | "record" | "mercy">): StoryNode {
  return {
    id: "test-node",
    text: "The vault is open and nobody is coming.",
    choices: [
      { id: "act", label: "Do it.", reactions, effects: [{ type: "end" }] },
    ],
  };
}

describe("reactionTotal", () => {
  it("sums what one companion makes of a set of tags", () => {
    expect(reactionTotal(VESPER, ["salvage"])).toBe(VESPER.values.salvage);
    expect(reactionTotal(VESPER, ["salvage", "procedure"])).toBe(
      VESPER.values.salvage! + VESPER.values.procedure!,
    );
  });

  it("scores a tag they have no opinion about as nothing", () => {
    expect(reactionTotal(SILL, ["not-a-tag"])).toBe(0);
    expect(reactionTotal(SILL, [])).toBe(0);
    expect(reactionTotal(SILL, undefined)).toBe(0);
  });

  it("reads the same act two different ways", () => {
    // The whole mechanism in one line: one tag, opposite signs.
    expect(reactionTotal(VESPER, ["salvage"])).toBeGreaterThan(0);
    expect(reactionTotal(SILL, ["salvage"])).toBeLessThan(0);
  });
});

describe("reactionChanges", () => {
  it("resolves one set of tags across everybody watching", () => {
    expect(reactionChanges(["vesper", "sill"], ["salvage"])).toEqual([
      { companionId: "vesper", delta: VESPER.values.salvage },
      { companionId: "sill", delta: SILL.values.salvage },
    ]);
  });

  it("reports only what actually moved", () => {
    // Tags that cancel out, and tags nobody has an opinion on, are not
    // "loyalty unchanged" entries — they are silence.
    expect(reactionChanges(["sill"], ["not-a-tag"])).toEqual([]);
    expect(reactionChanges(["vesper"], [])).toEqual([]);
    expect(reactionChanges(["vesper"], undefined)).toEqual([]);
  });

  it("ignores a witness no content defines", () => {
    expect(reactionChanges(["nobody"], ["mercy"])).toEqual([]);
  });
});

describe("applyLoyaltyChanges", () => {
  it("folds changes into the party", () => {
    const state = crew("vesper", "vesper");
    const next = applyLoyaltyChanges(state, [
      { companionId: "vesper", delta: 3 },
    ]);
    expect(getMember(next.party, "vesper")!.loyalty).toBe(3);
    // Pure: the state handed in is untouched.
    expect(getMember(state.party, "vesper")!.loyalty).toBe(0);
  });

  it("skips somebody who is no longer in the party", () => {
    const state = freshState();
    expect(applyLoyaltyChanges(state, [{ companionId: "sill", delta: 2 }])).toBe(
      state,
    );
  });
});

describe("choice reactions, through the engine", () => {
  it("moves the loyalty of the companion who watched it", () => {
    const node = taggedNode("salvage");
    const outcome = applyChoice(crew("vesper", "vesper"), node, "act");
    expect(getMember(outcome.state.party, "vesper")!.loyalty).toBe(
      VESPER.values.salvage,
    );
    expect(outcome.loyalty).toEqual([
      { companionId: "vesper", delta: VESPER.values.salvage },
    ]);
  });

  it("costs you with one crew what it earns you with the other", () => {
    const takeIt = applyChoice(crew("sill", "vesper", "sill"), taggedNode("salvage"), "act");
    // Only the one standing there reacts — the benched runner is not
    // there to approve of a vault she never saw opened.
    expect(takeIt.loyalty).toEqual([
      { companionId: "sill", delta: SILL.values.salvage },
    ]);
    expect(getMember(takeIt.state.party, "vesper")!.loyalty).toBe(0);

    const withHer = applyChoice(crew("vesper", "vesper", "sill"), taggedNode("salvage"), "act");
    expect(withHer.loyalty).toEqual([
      { companionId: "vesper", delta: VESPER.values.salvage },
    ]);
  });

  it("leaves an untagged choice alone, which is almost every choice", () => {
    const node: StoryNode = {
      id: "plain",
      text: "It rains.",
      choices: [{ id: "act", label: "Stand in it.", effects: [{ type: "end" }] }],
    };
    const outcome = applyChoice(crew("vesper", "vesper"), node, "act");
    expect(outcome.loyalty).toEqual([]);
    expect(getMember(outcome.state.party, "vesper")!.loyalty).toBe(0);
  });

  it("is a no-op for a player walking alone", () => {
    const outcome = applyChoice(freshState(), taggedNode("salvage"), "act");
    expect(outcome.loyalty).toEqual([]);
    expect(outcome.state.party.members).toEqual([]);
  });

  it("does not credit somebody the same choice recruited", () => {
    // Witnesses are read before the effects land: he was not there when
    // it was decided, so he has no opinion about it.
    const node: StoryNode = {
      id: "hire",
      text: "He folds the table.",
      choices: [
        {
          id: "act",
          label: "Take him on.",
          reactions: ["record"],
          effects: [
            { type: "recruit-companion", companionId: "sill" },
            { type: "end" },
          ],
        },
      ],
    };
    const outcome = applyChoice(freshState(), node, "act");
    expect(outcome.loyalty).toEqual([]);
    expect(getMember(outcome.state.party, "sill")!.loyalty).toBe(0);
  });

  it("stacks with a companion-loyalty effect on the same choice", () => {
    const node: StoryNode = {
      id: "both",
      text: "You put your name under it.",
      choices: [
        {
          id: "act",
          label: "Sign.",
          reactions: ["record"],
          effects: [
            { type: "companion-loyalty", companionId: "sill", amount: 2 },
            { type: "end" },
          ],
        },
      ],
    };
    const outcome = applyChoice(crew("sill", "sill"), node, "act");
    expect(getMember(outcome.state.party, "sill")!.loyalty).toBe(
      2 + SILL.values.record!,
    );
  });
});

describe("witnesses", () => {
  it("is whoever is out with the player, and nobody else", () => {
    expect(witnesses(freshState())).toEqual([]);
    expect(witnesses(crew("sill", "vesper", "sill"))).toEqual(["sill"]);
    expect(witnesses(crew(null, "vesper", "sill"))).toEqual([]);
  });
});

describe("the loyalty requirement", () => {
  const state = (loyalty: number): GameState => {
    const base = crew("vesper", "vesper");
    return { ...base, party: adjustLoyalty(base.party, "vesper", loyalty) };
  };

  it("opens at or above the figure", () => {
    const gate = { type: "loyalty", companionId: "vesper", value: 4 } as const;
    expect(checkRequirement(state(3), gate)).toBe(false);
    expect(checkRequirement(state(4), gate)).toBe(true);
    expect(checkRequirement(state(9), gate)).toBe(true);
  });

  it("reads the other way round when asked to", () => {
    const gate = {
      type: "loyalty",
      companionId: "vesper",
      value: -3,
      mode: "at-most",
    } as const;
    expect(checkRequirement(state(-2), gate)).toBe(false);
    expect(checkRequirement(state(-3), gate)).toBe(true);
    expect(checkRequirement(state(-7), gate)).toBe(true);
  });

  it("stands somebody never met at nothing", () => {
    expect(
      checkRequirement(freshState(), {
        type: "loyalty",
        companionId: "sill",
        value: 1,
      }),
    ).toBe(false);
    expect(
      checkRequirement(freshState(), {
        type: "loyalty",
        companionId: "sill",
        value: 0,
      }),
    ).toBe(true);
  });
});

describe("personalSceneReady", () => {
  /** A crew where `id` is out and has made their mind up. */
  function decided(id: string, loyalty = getCompanion(id)!.personalScene.loyalty) {
    const base = crew(id, id);
    return { ...base, party: adjustLoyalty(base.party, id, loyalty) };
  }

  it("waits until they have decided about you", () => {
    expect(personalSceneReady(decided("vesper", 0), "vesper")).toBe(false);
    expect(
      personalSceneReady(decided("vesper", VESPER.personalScene.loyalty - 1), "vesper"),
    ).toBe(false);
    expect(personalSceneReady(decided("vesper"), "vesper")).toBe(true);
  });

  it("wants them out with you, not sitting this one out", () => {
    const state = decided("sill");
    const benched: GameState = {
      ...state,
      party: setActive(state.party, "sill", false),
    };
    expect(personalSceneReady(benched, "sill")).toBe(false);
  });

  it("closes for good once the scene has been had", () => {
    const state = decided("sill");
    const after: GameState = {
      ...state,
      flags: { ...state.flags, [SILL.personalScene.resolvedFlag]: "kept" },
    };
    expect(personalSceneReady(after, "sill")).toBe(false);
  });

  it("says nothing about somebody who never joined", () => {
    expect(personalSceneReady(freshState(), "vesper")).toBe(false);
  });

  it("lists whoever has something to say, with the node to open", () => {
    expect(readyPersonalScenes(freshState())).toEqual([]);
    expect(readyPersonalScenes(decided("sill"))).toEqual([
      { companionId: "sill", nodeId: SILL.personalScene.nodeId },
    ]);
  });
});
