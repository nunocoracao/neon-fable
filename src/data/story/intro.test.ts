import { describe, expect, it } from "vitest";
import { createCharacter, defaultAllocation } from "../../character";
import { addItem, hasItem, installEnhancement } from "../../inventory";
import {
  applyChoice,
  availableChoices,
  requireNode,
  validateArc,
} from "../../narrative";
import { createNewGame, type GameState } from "../../state";
import { getBackground } from "../backgrounds";
import { introArc } from "./intro";

function makeState(backgroundId: string): GameState {
  const character = createCharacter({
    name: "Vex",
    background: getBackground(backgroundId)!,
    allocation: defaultAllocation(),
  });
  return createNewGame({ character, seed: 1 });
}

/** Takes a choice on a node looked up by id, returning the full outcome. */
function take(state: GameState, nodeId: string, choiceId: string) {
  return applyChoice(state, requireNode(introArc, nodeId), choiceId);
}

describe("intro arc graph", () => {
  it("passes validation", () => {
    expect(validateArc(introArc)).toEqual([]);
  });

  it("has at least 8 nodes", () => {
    expect(introArc.nodes.length).toBeGreaterThanOrEqual(8);
  });
});

describe("intro arc gating", () => {
  it("background-gates the Filament door: corp talk only for tower analysts", () => {
    const door = requireNode(introArc, "filament-door");
    const corpIds = availableChoices(makeState("tower-analyst"), door).map(
      (p) => p.choice.id,
    );
    const streetIds = availableChoices(makeState("gutter-courier"), door).map(
      (p) => p.choice.id,
    );
    expect(corpIds).toContain("corp-talk");
    expect(corpIds).not.toContain("street-nod");
    expect(streetIds).toContain("street-nod");
    expect(streetIds).not.toContain("corp-talk");
  });

  it("stat-gates the market theft, shown disabled below reflexes 8", () => {
    const market = requireNode(introArc, "wet-market");
    // Gutter courier: effective reflexes 9 (7 base + knife + slicker).
    const nimble = availableChoices(makeState("gutter-courier"), market);
    expect(
      nimble.find((p) => p.choice.id === "lift-patch")?.enabled,
    ).toBe(true);
    // Tower analyst: effective reflexes 6 — still listed, but disabled.
    const slow = availableChoices(makeState("tower-analyst"), market);
    expect(slow.find((p) => p.choice.id === "lift-patch")?.enabled).toBe(false);
  });

  it("item-gates the bouncer bribe on carrying a trauma patch", () => {
    const door = requireNode(introArc, "filament-door");
    const state = makeState("grid-diver");
    expect(
      availableChoices(state, door).find((p) => p.choice.id === "bribe-patch")
        ?.enabled,
    ).toBe(false);

    const stocked = {
      ...state,
      inventory: addItem(state.inventory, "con-trauma-patch"),
    };
    expect(
      availableChoices(stocked, door).find((p) => p.choice.id === "bribe-patch")
        ?.enabled,
    ).toBe(true);
    const outcome = take(stocked, "filament-door", "bribe-patch");
    expect(hasItem(outcome.state.inventory, "con-trauma-patch")).toBe(false);
    expect(outcome.state.flags["door-entry"]).toBe("bribe");
  });

  it("enhancement-gates the badge scan on an installed optic suite", () => {
    const undercroft = requireNode(introArc, "undercroft");
    const bare = makeState("gutter-courier");
    expect(
      availableChoices(bare, undercroft).map((p) => p.choice.id),
    ).not.toContain("optic-scan");

    const carrying = addItem(bare.inventory, "cyb-optic-suite");
    const loadout = installEnhancement(bare.player, carrying, "cyb-optic-suite");
    const chromed = { ...bare, player: loadout.character, inventory: loadout.inventory };
    expect(
      availableChoices(chromed, undercroft).map((p) => p.choice.id),
    ).toContain("optic-scan");
  });

  it("stubs combat: jumping the scout surfaces the encounter id", () => {
    let state = makeState("gutter-courier");
    state = take(state, "start", "go-cold").state;
    const outcome = take(state, "undercroft", "jump-scout");
    expect(outcome.encounterId).toBe("enc-auric-scout");
    expect(outcome.nextNodeId).toBe("spike-secured");
    expect(hasItem(outcome.state.inventory, "msc-cracked-spike")).toBe(true);
  });
});

describe("intro arc walkthrough", () => {
  it("the terms chosen at the very first node decide the meeting scene", () => {
    const barFloor = requireNode(introArc, "bar-floor");

    // Agreeing to terms up front leads to the warm meeting and an advance.
    let agreed = makeState("gutter-courier");
    agreed = take(agreed, "start", "agree-terms").state;
    const agreedSeats = availableChoices(agreed, barFloor);
    expect(agreedSeats.map((p) => p.choice.id)).toEqual(["sit-agreed"]);
    expect(take(agreed, "bar-floor", "sit-agreed").nextNodeId).toBe(
      "sable-warm",
    );

    // Going in cold reaches a different node with no advance on offer.
    let cold = makeState("gutter-courier");
    cold = take(cold, "start", "go-cold").state;
    const coldSeats = availableChoices(cold, barFloor);
    expect(coldSeats.map((p) => p.choice.id)).toEqual(["sit-cold"]);
    expect(take(cold, "bar-floor", "sit-cold").nextNodeId).toBe("sable-cold");
  });

  it("plays the agreed corp route start to finish with correct credits", () => {
    let state = makeState("tower-analyst");

    let step = take(state, "start", "agree-terms");
    expect(step.nextNodeId).toBe("wet-market");
    step = take(step.state, "wet-market", "walk-on");
    step = take(step.state, "filament-door", "pay-cover");
    expect(step.state.credits).toBe(10); // 25 - 15 cover
    step = take(step.state, "bar-floor", "sit-agreed");
    step = take(step.state, "sable-warm", "take-advance");
    expect(step.state.credits).toBe(60); // + 50 advance
    step = take(step.state, "job-brief", "take-job");
    expect(step.state.flags["job-accepted"]).toBe(true);
    // Tower analyst: effective cool 8 (7 base + spire suit) passes the bluff.
    step = take(step.state, "undercroft", "bluff-scout");
    expect(hasItem(step.state.inventory, "msc-cracked-spike")).toBe(true);
    step = take(step.state, "spike-secured", "back-to-bar");
    step = take(step.state, "finale", "hand-over");

    expect(step.ended).toBe(true);
    expect(step.endingId).toBe("job-done");
    expect(step.nextNodeId).toBeNull();
    expect(step.state.credits).toBe(260); // + 200 payout
    expect(hasItem(step.state.inventory, "msc-cracked-spike")).toBe(false);
    expect(step.state.flags["spike-delivered"]).toBe(true);
  });

  it("walking away from the job ends the arc early", () => {
    let state = makeState("gutter-courier");
    state = take(state, "start", "go-cold").state;
    const outcome = take(state, "job-brief", "walk-away");
    expect(outcome.ended).toBe(true);
    expect(outcome.endingId).toBe("walked-away");
  });
});
