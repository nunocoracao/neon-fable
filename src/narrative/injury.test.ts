import { describe, expect, it } from "vitest";
import { injureCharacter } from "../character/injury";
import { requireInjury } from "../data/injuries";
import { createNewGame, type GameState } from "../state";
import { recruitCompanion, setCompanionInjury } from "../state/party";
import { checkRequirement } from "./requirements";
import type { StoryArc } from "./types";
import { validateArc } from "./validate";

/**
 * The narrative layer's two new words: the gate a clinic line opens on,
 * and the validator that refuses to ship one addressed to nothing.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";

function hurt(injuryId: string): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 6 });
  return { ...state, player: injureCharacter(state.player, injuryId) };
}

describe("the injury requirement", () => {
  it("asks whether they are hurt at all", () => {
    expect(checkRequirement(hurt(WINGED), { type: "injury" })).toBe(true);
    expect(
      checkRequirement(createNewGame({ seed: 6 }), { type: "injury" }),
    ).toBe(false);
  });

  it("asks about a specific wound when it names one", () => {
    const state = hurt(WINGED);
    expect(
      checkRequirement(state, { type: "injury", injuryId: WINGED }),
    ).toBe(true);
    expect(
      checkRequirement(state, { type: "injury", injuryId: CONCUSSED }),
    ).toBe(false);
  });

  it("asks about a companion when it names one", () => {
    const base = createNewGame({ playerName: "Vex", seed: 6 });
    const state: GameState = {
      ...base,
      party: setCompanionInjury(
        recruitCompanion(base.party, "vesper"),
        "vesper",
        { id: CONCUSSED, scenesLeft: requireInjury(CONCUSSED).scenes },
      ),
    };
    expect(
      checkRequirement(state, { type: "injury", companionId: "vesper" }),
    ).toBe(true);
    expect(
      checkRequirement(state, {
        type: "injury",
        companionId: "vesper",
        injuryId: CONCUSSED,
      }),
    ).toBe(true);
    // And it is asked of *them*, not of the player standing beside them.
    expect(checkRequirement(state, { type: "injury" })).toBe(false);
  });

  it("closes on somebody this run never recruited", () => {
    expect(
      checkRequirement(hurt(WINGED), {
        type: "injury",
        companionId: "vesper",
      }),
    ).toBe(false);
  });
});

describe("validateArc", () => {
  function arcGating(injuryId: string): StoryArc {
    return {
      id: "test-arc",
      title: "Test",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "A counter.",
          choices: [
            {
              id: "treat",
              label: "Fix it.",
              requirements: [{ type: "injury", injuryId }],
              effects: [{ type: "treat-injury" }, { type: "end" }],
            },
          ],
        },
      ],
    };
  }

  it("passes an arc gating on a real injury", () => {
    expect(validateArc(arcGating(WINGED))).toEqual([]);
  });

  it("fails an arc gating on a wound this build does not have", () => {
    const issues = validateArc(arcGating("inj-nonexistent"));
    expect(issues.map((issue) => issue.code)).toContain("unknown-injury");
  });

  it("fails a treatment addressed to a companion nobody wrote", () => {
    const arc: StoryArc = {
      id: "test-arc",
      title: "Test",
      entryNodeId: "start",
      nodes: [
        {
          id: "start",
          text: "A counter.",
          choices: [
            {
              id: "treat",
              label: "Fix them.",
              requirements: [{ type: "injury", companionId: "nobody" }],
              effects: [
                { type: "treat-injury", companionId: "nobody" },
                { type: "end" },
              ],
            },
          ],
        },
      ],
    };
    expect(validateArc(arc).map((issue) => issue.code)).toContain(
      "unknown-companion",
    );
  });
});
