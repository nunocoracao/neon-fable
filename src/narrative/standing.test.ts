import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { REPUTATION_MAX } from "../data/factions";
import {
  applyStanding,
  bandOf,
  createNewGame,
  emptyReputation,
  reputationOf,
  type GameState,
} from "../state";
import { applyChoice } from "./engine";
import { checkRequirement } from "./requirements";
import {
  applyStandingChanges,
  bandCrossings,
  choiceStandingChanges,
  standingChanges,
} from "./standing";
import type { StoryNode } from "./types";
import { validateArc } from "./validate";

function makeState(standing: Record<string, number> = {}): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed: 3 });
  return { ...state, reputation: applyStanding(emptyReputation(), standing) };
}

const node: StoryNode = {
  id: "n1",
  text: "The boards read their own names.",
  choices: [
    {
      id: "expose",
      label: "Tell them.",
      target: "n2",
      standing: { auric: -12, market: 12, court: 6 },
    },
    { id: "walk", label: "Walk away.", target: "n2" },
  ],
};

describe("standingChanges", () => {
  it("reports what a swing would move, per faction", () => {
    const changes = standingChanges(makeState(), { auric: -12, market: 12 });
    expect(changes.map((c) => [c.factionId, c.delta])).toEqual([
      ["auric", -12],
      ["market", 12],
    ]);
    expect(changes[0]).toMatchObject({ from: 0, to: -12, bandChanged: false });
  });

  it("drops factions the swing leaves alone", () => {
    expect(standingChanges(makeState(), { court: 0 })).toEqual([]);
    expect(standingChanges(makeState(), undefined)).toEqual([]);
  });

  it("reports only what landed once the scale runs out", () => {
    const state = makeState({ auric: REPUTATION_MAX - 4 });
    const [change] = standingChanges(state, { auric: 20 });
    expect(change).toMatchObject({ delta: 4, to: REPUTATION_MAX });
  });

  it("reports nothing at all for a faction already pinned", () => {
    const state = makeState({ auric: REPUTATION_MAX });
    expect(standingChanges(state, { auric: 20 })).toEqual([]);
  });

  it("marks the shift that crossed into another band", () => {
    const state = makeState({ court: 18 });
    const changes = standingChanges(state, { court: 6, market: 6 });
    expect(bandCrossings(changes).map((c) => c.factionId)).toEqual(["court"]);
    expect(changes[0]).toMatchObject({ fromBand: "neutral", toBand: "warm" });
  });

  it("resolves each faction against the standing the last one left", () => {
    // Two swings in one choice must not both read the same starting
    // point for the same faction — this is the guard on that.
    const state = makeState({ court: REPUTATION_MAX - 2 });
    const changes = standingChanges(state, { court: 5 });
    expect(changes[0]!.delta).toBe(2);
  });
});

describe("applyStandingChanges", () => {
  it("folds resolved changes into the state", () => {
    const state = makeState();
    const changes = choiceStandingChanges(state, node.choices[0]!);
    const next = applyStandingChanges(state, changes);
    expect(reputationOf(next.reputation, "market")).toBe(12);
    expect(reputationOf(state.reputation, "market")).toBe(0);
  });

  it("returns the same state when nothing moved", () => {
    const state = makeState();
    expect(applyStandingChanges(state, [])).toBe(state);
  });
});

describe("applyChoice", () => {
  it("applies a choice's standing tag and reports it back", () => {
    const outcome = applyChoice(makeState(), node, "expose");
    expect(outcome.standing.map((c) => c.factionId)).toEqual([
      "auric",
      "court",
      "market",
    ]);
    expect(reputationOf(outcome.state.reputation, "auric")).toBe(-12);
    expect(bandOf(outcome.state.reputation, "market").id).toBe("neutral");
  });

  it("reports nothing for an untagged choice", () => {
    const outcome = applyChoice(makeState(), node, "walk");
    expect(outcome.standing).toEqual([]);
    expect(outcome.state.reputation).toEqual(emptyReputation());
  });

  it("accumulates across choices, and crosses a band when it should", () => {
    let state = makeState();
    for (let i = 0; i < 2; i += 1) {
      state = applyChoice(state, node, "expose").state;
    }
    expect(reputationOf(state.reputation, "market")).toBe(24);
    const outcome = applyChoice(state, node, "expose");
    expect(bandCrossings(outcome.standing)).toEqual([]);
    expect(bandOf(outcome.state.reputation, "market").id).toBe("warm");
  });
});

describe("the reputation requirement", () => {
  const state = makeState({ court: 62, auric: -70 });

  it("gates on a band the player has reached", () => {
    expect(
      checkRequirement(state, {
        type: "reputation",
        factionId: "court",
        value: "trusted",
      }),
    ).toBe(true);
    expect(
      checkRequirement(state, {
        type: "reputation",
        factionId: "market",
        value: "warm",
      }),
    ).toBe(false);
  });

  it("gates the other way for a door only trouble opens", () => {
    expect(
      checkRequirement(state, {
        type: "reputation",
        factionId: "auric",
        value: "cold",
        mode: "at-most",
      }),
    ).toBe(true);
  });
});

describe("the dominant-faction requirement", () => {
  it("opens the one variant the city's own arithmetic picks", () => {
    const state = makeState({ court: 62, market: 30, auric: -70 });
    const variants = (["court", "market", "auric", "none"] as const).filter(
      (factionId) =>
        checkRequirement(state, { type: "dominant-faction", factionId }),
    );
    expect(variants).toEqual(["court"]);
  });

  it("opens the split-city variant when nobody stands above the rest", () => {
    const splits: Record<string, number>[] = [
      {},
      { court: 40, market: 40 },
      { court: 12 },
    ];
    for (const standing of splits) {
      const state = makeState(standing);
      expect(
        checkRequirement(state, { type: "dominant-faction", factionId: "none" }),
      ).toBe(true);
      expect(
        checkRequirement(state, {
          type: "dominant-faction",
          factionId: "court",
        }),
      ).toBe(false);
    }
  });

  it("reads the floor the content authored", () => {
    const state = makeState({ market: 30, court: 10 });
    expect(
      checkRequirement(state, {
        type: "dominant-faction",
        factionId: "market",
        min: "trusted",
      }),
    ).toBe(false);
    expect(
      checkRequirement(state, {
        type: "dominant-faction",
        factionId: "market",
        min: "neutral",
      }),
    ).toBe(true);
  });
});

describe("validateArc", () => {
  it("catches a swing addressed to nobody", () => {
    const issues = validateArc({
      id: "test",
      title: "Test",
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          text: "…",
          choices: [
            {
              id: "c",
              label: "…",
              standing: { longshore: 6 } as never,
              effects: [{ type: "end" }],
            },
          ],
        },
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["unknown-faction"]);
  });

  it("catches a gate on a band that does not exist", () => {
    const issues = validateArc({
      id: "test",
      title: "Test",
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          text: "…",
          choices: [
            {
              id: "c",
              label: "…",
              requirements: [
                {
                  type: "reputation",
                  factionId: "court",
                  value: "beloved" as never,
                },
              ],
              effects: [{ type: "end" }],
            },
          ],
        },
      ],
    });
    expect(issues.map((i) => i.code)).toEqual(["unknown-band"]);
  });

  it("holds a dominance gate to the same names and bands", () => {
    const issues = validateArc({
      id: "test",
      title: "Test",
      entryNodeId: "n1",
      nodes: [
        {
          id: "n1",
          text: "…",
          choices: [
            {
              id: "c",
              label: "…",
              requirements: [
                {
                  type: "dominant-faction",
                  factionId: "longshore" as never,
                  min: "beloved" as never,
                },
              ],
              effects: [{ type: "end" }],
            },
            {
              // The split-city variant names no faction, and must not
              // be read as one.
              id: "split",
              label: "…",
              requirements: [{ type: "dominant-faction", factionId: "none" }],
              effects: [{ type: "end" }],
            },
          ],
        },
      ],
    });
    expect(issues.map((i) => i.code).sort()).toEqual([
      "unknown-band",
      "unknown-faction",
    ]);
  });
});
