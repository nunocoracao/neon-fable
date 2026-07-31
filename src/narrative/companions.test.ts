import { describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import {
  createNewGame,
  getMember,
  recruitCompanion,
  setActive,
  type GameState,
} from "../state";
import { companionAside, companionAsides } from "./companions";
import { applyChoice } from "./engine";
import { applyEffect } from "./effects";
import { checkRequirement } from "./requirements";
import type { StoryNode } from "./types";
import { validateArc } from "./validate";

/**
 * The companion hooks the narrative layer grew: an effect that recruits,
 * a requirement that asks who is with you, and node comments that let a
 * companion speak in a scene written for somebody else.
 */

function freshState(): GameState {
  return createNewGame({ character: fixtureCharacter({}), seed: 4 });
}

function withVesper(): GameState {
  const state = freshState();
  return { ...state, party: recruitCompanion(state.party, "vesper") };
}

const commentedNode: StoryNode = {
  id: "test-node",
  text: "The rain does what rain does.",
  comments: [
    {
      companionId: "vesper",
      text: "\"Told you the plank was rotten.\"",
      requirements: [{ type: "flag-equals", key: "plank", value: true }],
    },
    { companionId: "vesper", text: "\"Charming.\"" },
  ],
  choices: [{ id: "on", label: "Go on.", effects: [{ type: "end" }] }],
};

describe("the recruit-companion effect", () => {
  it("puts the companion in the party, active", () => {
    const next = applyEffect(freshState(), {
      type: "recruit-companion",
      companionId: "vesper",
    });
    const member = getMember(next.party, "vesper")!;
    expect(member.recruited).toBe(true);
    expect(member.active).toBe(true);
  });

  it("degrades on unknown content instead of crashing a scene", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = freshState();
    const next = applyEffect(state, {
      type: "recruit-companion",
      companionId: "nobody",
    });
    expect(next.party.members).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("the companion-loyalty effect", () => {
  it("moves the standing of somebody in the party", () => {
    const next = applyEffect(withVesper(), {
      type: "companion-loyalty",
      companionId: "vesper",
      amount: -2,
    });
    expect(getMember(next.party, "vesper")!.loyalty).toBe(-2);
  });

  it("is a no-op when there is nobody to earn it from", () => {
    const state = freshState();
    expect(
      applyEffect(state, {
        type: "companion-loyalty",
        companionId: "vesper",
        amount: 3,
      }),
    ).toBe(state);
  });
});

describe("the companion requirement", () => {
  it("passes only while they are actually with you", () => {
    const state = withVesper();
    const active = { type: "companion" as const, companionId: "vesper" };
    expect(checkRequirement(state, active)).toBe(true);

    const benched: GameState = {
      ...state,
      party: setActive(state.party, "vesper", false),
    };
    expect(checkRequirement(benched, active)).toBe(false);
    // "recruited" is the softer question, and it still passes.
    expect(
      checkRequirement(benched, { ...active, status: "recruited" }),
    ).toBe(true);
  });

  it("fails for a companion never met", () => {
    expect(
      checkRequirement(freshState(), {
        type: "companion",
        companionId: "vesper",
        status: "recruited",
      }),
    ).toBe(false);
  });
});

describe("companion asides", () => {
  it("says nothing when nobody is with you", () => {
    expect(companionAsides(commentedNode, freshState())).toEqual([]);
    expect(companionAside(commentedNode, freshState())).toBeNull();
  });

  it("shows the first line whose own requirements pass", () => {
    const state = withVesper();
    expect(companionAside(commentedNode, state)).toEqual({
      companionId: "vesper",
      text: "\"Charming.\"",
    });

    const soaked: GameState = { ...state, flags: { plank: true } };
    expect(companionAside(commentedNode, soaked)?.text).toBe(
      "\"Told you the plank was rotten.\"",
    );
    expect(companionAsides(commentedNode, soaked)).toHaveLength(2);
  });

  it("goes quiet again when the companion is benched", () => {
    const state = withVesper();
    const benched: GameState = {
      ...state,
      party: setActive(state.party, "vesper", false),
    };
    expect(companionAside(commentedNode, benched)).toBeNull();
  });

  it("is purely additive: a node with no comments reads as before", () => {
    const plain: StoryNode = { id: "plain", text: "Nothing.", choices: [] };
    expect(companionAsides(plain, withVesper())).toEqual([]);
  });

  it("never touches state — the choice is what changes the world", () => {
    const state = withVesper();
    companionAsides(commentedNode, state);
    const outcome = applyChoice(state, commentedNode, "on");
    expect(outcome.ended).toBe(true);
    expect(state.flags).toEqual({});
  });
});

describe("arc validation", () => {
  it("fails an arc that recruits, gates on, or quotes an unknown companion", () => {
    const issues = validateArc({
      id: "broken",
      title: "Broken",
      entryNodeId: "a",
      nodes: [
        {
          id: "a",
          text: "…",
          comments: [{ companionId: "ghost", text: "…" }],
          choices: [
            {
              id: "join",
              label: "Join up.",
              requirements: [{ type: "companion", companionId: "phantom" }],
              effects: [
                { type: "recruit-companion", companionId: "ghost" },
                { type: "companion-loyalty", companionId: "ghost", amount: 1 },
                { type: "end" },
              ],
            },
          ],
        },
      ],
    });
    expect(issues.filter((i) => i.code === "unknown-companion")).toHaveLength(4);
  });

  it("passes an arc that names a real one", () => {
    const issues = validateArc({
      id: "fine",
      title: "Fine",
      entryNodeId: "a",
      nodes: [
        {
          id: "a",
          text: "…",
          comments: [{ companionId: "vesper", text: "…" }],
          choices: [
            {
              id: "join",
              label: "Join up.",
              effects: [
                { type: "recruit-companion", companionId: "vesper" },
                { type: "end" },
              ],
            },
          ],
        },
      ],
    });
    expect(issues).toEqual([]);
  });
});
