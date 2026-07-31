import { describe, expect, it } from "vitest";
import { characterInjury, injureCharacter } from "../../character/injury";
import { applyChoice, availableChoices, requireNode } from "../../narrative";
import { validateArc } from "../../narrative/validate";
import { createNewGame, type GameState } from "../../state";
import { companionInjury, recruitCompanion, setCompanionInjury } from "../../state/party";
import { injuries, requireInjury } from "../injuries";
import { act1Arc } from "./act1";

/**
 * Patch's Den as a clinic: that every wound in the pool has a line
 * written for it, that the line names the specific thing that is wrong,
 * and that walking in unhurt shows none of it.
 */

const DEN = "a1-patch";

function den() {
  return requireNode(act1Arc, DEN);
}

function hurtRun(injuryId: string): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 9 });
  return {
    ...state,
    credits: 500,
    player: injureCharacter(state.player, injuryId),
  };
}

function labels(state: GameState, nodeId: string): string[] {
  return availableChoices(state, requireNode(act1Arc, nodeId)).map(
    (presented) => presented.choice.id,
  );
}

describe("the den's clinic doors", () => {
  it("shows none of them to somebody who walked in fine", () => {
    const clean = createNewGame({ playerName: "Vex", seed: 9 });
    const shown = labels(clean, DEN);
    expect(shown.filter((id) => id.startsWith("clinic-"))).toEqual([]);
    // The shop is still open, obviously.
    expect(shown).toContain("browse");
  });

  it("has a door for every injury the pool can hand out", () => {
    for (const injury of injuries) {
      const shown = labels(hurtRun(injury.id), DEN);
      const doors = shown.filter((id) => id.startsWith("clinic-"));
      expect(doors, injury.id).toHaveLength(1);
    }
  });

  it("opens exactly one door at a time — you carry one wound", () => {
    for (const injury of injuries) {
      const state = hurtRun(injury.id);
      const opened = den()
        .choices.filter((choice) =>
          choice.requirements?.some(
            (req) => req.type === "injury" && req.injuryId != null,
          ),
        )
        .filter((choice) =>
          availableChoices(state, den()).some((p) => p.choice.id === choice.id),
        );
      expect(opened, injury.id).toHaveLength(1);
    }
  });

  it("names the wound in Patch's own line", () => {
    // Each door leads to a beat that mentions the injury by name.
    const doors: Array<[string, string]> = [
      ["inj-winged", "a1-patch-winged"],
      ["inj-concussed", "a1-patch-concussed"],
      ["inj-servo-lock", "a1-patch-servo"],
    ];
    for (const [injuryId, nodeId] of doors) {
      const node = requireNode(act1Arc, nodeId);
      const name = requireInjury(injuryId).name.toLowerCase();
      expect(node.text.toLowerCase(), nodeId).toContain(name);
    }
  });
});

describe("paying for it", () => {
  it("quotes the injury's own fee and takes exactly that", () => {
    for (const injury of injuries) {
      const state: GameState = { ...hurtRun(injury.id), credits: injury.treatCost };
      const door = availableChoices(state, den())
        .map((p) => p.choice)
        .find((choice) => choice.id.startsWith("clinic-"))!;
      const scene = requireNode(act1Arc, door.target!);
      const pay = scene.choices.find((choice) => choice.id === "pay")!;
      expect(pay.label, injury.id).toContain(`${injury.treatCost} cr`);

      const outcome = applyChoice(state, scene, "pay");
      expect(characterInjury(outcome.state.player), injury.id).toBeNull();
      expect(outcome.state.credits, injury.id).toBe(0);
    }
  });

  it("greys the line out rather than hiding it when the money is short", () => {
    const injury = requireInjury("inj-winged");
    const broke: GameState = { ...hurtRun(injury.id), credits: 0 };
    const scene = requireNode(act1Arc, "a1-patch-winged");
    const shown = availableChoices(broke, scene);
    const pay = shown.find((p) => p.choice.id === "pay");
    expect(pay).toBeDefined();
    expect(pay?.enabled).toBe(false);
  });

  it("lets a player walk out still carrying it", () => {
    const state = hurtRun("inj-concussed");
    const scene = requireNode(act1Arc, "a1-patch-concussed");
    const outcome = applyChoice(state, scene, "wait");
    expect(characterInjury(outcome.state.player)?.id).toBe("inj-concussed");
    expect(outcome.state.credits).toBe(state.credits);
    expect(outcome.nextNodeId).toBe(DEN);
  });
});

describe("the crew's side of the counter", () => {
  function withHurtVesper(injuryId: string): GameState {
    const state = createNewGame({ playerName: "Vex", seed: 9 });
    return {
      ...state,
      credits: 500,
      party: setCompanionInjury(recruitCompanion(state.party, "vesper"), "vesper", {
        id: injuryId,
        scenesLeft: requireInjury(injuryId).scenes,
      }),
    };
  }

  it("stays shut when nobody is travelling with you", () => {
    const shown = labels(hurtRun("inj-winged"), DEN);
    expect(shown.filter((id) => id.startsWith("clinic-crew"))).toEqual([]);
  });

  it("stays shut when the companion came through fine", () => {
    const state = createNewGame({ playerName: "Vex", seed: 9 });
    const well: GameState = {
      ...state,
      party: recruitCompanion(state.party, "vesper"),
    };
    expect(labels(well, DEN).filter((id) => id.startsWith("clinic-crew"))).toEqual(
      [],
    );
  });

  it("opens one door per wound, and never two at once", () => {
    for (const [injuryId, doorId] of [
      ["inj-winged", "clinic-crew-arm"],
      ["inj-concussed", "clinic-crew-head"],
    ] as const) {
      const shown = labels(withHurtVesper(injuryId), DEN);
      expect(shown.filter((id) => id.startsWith("clinic-crew")), injuryId).toEqual([
        doorId,
      ]);
    }
  });

  it("names their wound in Patch's line and treats it off the same purse", () => {
    for (const [injuryId, nodeId] of [
      ["inj-winged", "a1-patch-crew-arm"],
      ["inj-concussed", "a1-patch-crew-head"],
    ] as const) {
      const state = withHurtVesper(injuryId);
      const scene = requireNode(act1Arc, nodeId);
      expect(scene.text.toLowerCase(), nodeId).toContain(
        requireInjury(injuryId).name.toLowerCase(),
      );

      const outcome = applyChoice(state, scene, "pay");
      expect(companionInjury(outcome.state.party, "vesper"), injuryId).toBeNull();
      expect(outcome.state.credits, injuryId).toBe(
        state.credits - requireInjury(injuryId).treatCost,
      );
      // The player, who was fine, stays fine.
      expect(characterInjury(outcome.state.player), injuryId).toBeNull();
    }
  });
});

describe("the arc still validates", () => {
  it("has no broken links, orphans, or unknown injury ids", () => {
    expect(validateArc(act1Arc)).toEqual([]);
  });
});
