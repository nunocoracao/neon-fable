import { describe, expect, it } from "vitest";
import { createNewGame, type GameState } from "../state";
import {
  applyChoice,
  availableChoices,
  getNode,
  NarrativeError,
  requireNode,
} from "./engine";
import type { StoryArc, StoryNode } from "./types";

function makeState(): GameState {
  return createNewGame({ seed: 1 });
}

const gateNode: StoryNode = {
  id: "gate",
  text: "A door with three locks.",
  choices: [
    { id: "open", label: "Open the unlocked door", target: "past" },
    {
      id: "hidden-way",
      label: "Whisper the passphrase",
      target: "past",
      requirements: [{ type: "flag-equals", key: "knows-phrase", value: true }],
    },
    {
      id: "locked-way",
      label: "Force the service hatch",
      target: "past",
      requirements: [{ type: "stat", stat: "body", value: 99 }],
      ifUnavailable: "disabled",
    },
  ],
};

const arc: StoryArc = {
  id: "test-arc",
  title: "Test Arc",
  entryNodeId: "gate",
  nodes: [gateNode, { id: "past", text: "Through.", choices: [] }],
};

describe("getNode / requireNode", () => {
  it("finds nodes by id", () => {
    expect(getNode(arc, "gate")).toBe(gateNode);
    expect(getNode(arc, "nowhere")).toBeUndefined();
  });

  it("requireNode throws NarrativeError('unknown-node') for missing ids", () => {
    expect(() => requireNode(arc, "nowhere")).toThrowError(NarrativeError);
    try {
      requireNode(arc, "nowhere");
    } catch (error) {
      expect((error as NarrativeError).code).toBe("unknown-node");
    }
  });
});

describe("availableChoices", () => {
  it("hides failing choices by default and disables opted-in ones", () => {
    const presented = availableChoices(makeState(), gateNode);
    expect(presented.map((p) => p.choice.id)).toEqual(["open", "locked-way"]);
    expect(presented.map((p) => p.enabled)).toEqual([true, false]);
  });

  it("enables a hidden choice once its requirement passes", () => {
    const state = makeState();
    state.flags["knows-phrase"] = true;
    const presented = availableChoices(state, gateNode);
    expect(presented.map((p) => p.choice.id)).toEqual([
      "open",
      "hidden-way",
      "locked-way",
    ]);
    expect(presented.find((p) => p.choice.id === "hidden-way")?.enabled).toBe(
      true,
    );
  });
});

describe("applyChoice", () => {
  it("throws NarrativeError('unknown-choice') for a missing choice id", () => {
    try {
      applyChoice(makeState(), gateNode, "nope");
      expect.unreachable();
    } catch (error) {
      expect((error as NarrativeError).code).toBe("unknown-choice");
    }
  });

  it("throws NarrativeError('requirements-not-met') for a gated choice", () => {
    try {
      applyChoice(makeState(), gateNode, "locked-way");
      expect.unreachable();
    } catch (error) {
      expect((error as NarrativeError).code).toBe("requirements-not-met");
    }
  });

  it("applies effects and returns the choice target, without mutating input", () => {
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          target: "next",
          effects: [
            { type: "set-flag", key: "done", value: true },
            { type: "credits", amount: 10 },
          ],
        },
      ],
    };
    const state = makeState();
    const outcome = applyChoice(state, node, "c");
    expect(outcome.nextNodeId).toBe("next");
    expect(outcome.ended).toBe(false);
    expect(outcome.encounterId).toBeNull();
    expect(outcome.state.flags.done).toBe(true);
    expect(outcome.state.credits).toBe(35);
    expect(state.flags.done).toBeUndefined();
    expect(state.credits).toBe(25);
  });

  it("goto overrides the choice target", () => {
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          target: "next",
          effects: [{ type: "goto", nodeId: "detour" }],
        },
      ],
    };
    expect(applyChoice(makeState(), node, "c").nextNodeId).toBe("detour");
  });

  it("end marks the outcome ended with no next node", () => {
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          effects: [{ type: "end", endingId: "epilogue" }],
        },
      ],
    };
    const outcome = applyChoice(makeState(), node, "c");
    expect(outcome.ended).toBe(true);
    expect(outcome.nextNodeId).toBeNull();
    expect(outcome.endingId).toBe("epilogue");
  });

  it("start-combat surfaces the encounter id alongside the next node", () => {
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          target: "aftermath",
          effects: [{ type: "start-combat", encounterId: "enc-test" }],
        },
      ],
    };
    const outcome = applyChoice(makeState(), node, "c");
    expect(outcome.encounterId).toBe("enc-test");
    expect(outcome.nextNodeId).toBe("aftermath");
  });

  it("travel surfaces the destination map alongside the next node", () => {
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          target: "arrival",
          effects: [{ type: "travel", mapId: "greywater-steps" }],
        },
      ],
    };
    const outcome = applyChoice(makeState(), node, "c");
    expect(outcome.travelTo).toBe("greywater-steps");
    expect(outcome.nextNodeId).toBe("arrival");
    expect(outcome.state.location).toBe("greywater-steps");
  });

  it("open-stylist surfaces the flag alongside the resume node, touching no state", () => {
    const state = makeState();
    const node: StoryNode = {
      id: "n",
      text: "",
      choices: [
        {
          id: "c",
          label: "",
          target: "after-chair",
          effects: [{ type: "open-stylist" }],
        },
      ],
    };
    const outcome = applyChoice(state, node, "c");
    expect(outcome.stylist).toBe(true);
    expect(outcome.nextNodeId).toBe("after-chair");
    expect(outcome.state).toEqual(state);
  });
});
