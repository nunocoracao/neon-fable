import { describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { createNewGame, type GameState } from "../state";
import { adjustReputation } from "../state/reputation";
import {
  EMPTY_WORLD,
  conditionsAllow,
  deriveWorldState,
  hasCondition,
  worldOf,
} from "./state";

/**
 * Derivation across flag fixtures. Each case is a run that has done a
 * specific thing; what matters is that the city reads exactly the
 * conditions that thing earns and none of the ones it does not.
 */

function makeState(flags: GameState["flags"] = {}): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed: 1 });
  return { ...state, flags: { ...state.flags, ...flags } };
}

/** Conditions beyond the two that hold for a run that has done nothing. */
function earned(state: GameState): string[] {
  return deriveWorldState(state).conditions.filter(
    (id) => id !== "streets-calm" && id !== "warrant-clear",
  );
}

describe("deriveWorldState", () => {
  it("reads a fresh run as a city with nothing to say", () => {
    expect(earned(makeState())).toEqual([]);
  });

  it("shutters the row the night the spike changes hands, for one act", () => {
    const delivered = makeState({ "spike-delivered": true });
    expect(earned(delivered)).toEqual(["package-delivered", "stalls-shuttered"]);

    // "For an act": Act 1 closing takes the shutters back up while the
    // delivery itself stays true forever.
    const later = makeState({ "spike-delivered": true, "act1-complete": true });
    expect(earned(later)).toEqual(["package-delivered"]);
  });

  it("reads a kept spike as loose property, and stops calling the streets calm", () => {
    const world = deriveWorldState(makeState({ "kept-spike": true }));
    expect(hasCondition(world, "package-loose")).toBe(true);
    expect(hasCondition(world, "streets-calm")).toBe(false);
    // The two are exact complements — never both, never neither.
    const calm = deriveWorldState(makeState());
    expect(hasCondition(calm, "package-loose")).toBe(false);
    expect(hasCondition(calm, "streets-calm")).toBe(true);
  });

  it("separates Act 1's three endings", () => {
    expect(earned(makeState({ "act1-outcome": "court" }))).toEqual([
      "court-ascendant",
    ]);
    expect(earned(makeState({ "act1-outcome": "voss" }))).toEqual([
      "syndicate-street",
    ]);
    expect(earned(makeState({ "act1-outcome": "broadcast" }))).toEqual([
      "broadcast-loose",
    ]);
  });

  it("tells a live warrant from a suspended one", () => {
    const wanted = deriveWorldState(makeState({ "wanted-by-auric": true }));
    expect(hasCondition(wanted, "warrant-out")).toBe(true);
    expect(hasCondition(wanted, "warrant-clear")).toBe(false);

    // Act 2's charter writes the flag to false rather than clearing it.
    // A run that has been through that is not wanted, and a flag-unset
    // gate would have got this wrong.
    const suspended = deriveWorldState(makeState({ "wanted-by-auric": false }));
    expect(hasCondition(suspended, "warrant-out")).toBe(false);
    expect(hasCondition(suspended, "warrant-clear")).toBe(true);
  });

  it("reads standings, not just flags", () => {
    const base = makeState();
    const cold = {
      ...base,
      reputation: adjustReputation(base.reputation, "auric", -70),
    };
    expect(hasCondition(deriveWorldState(cold), "spire-hardened")).toBe(true);

    const liked = {
      ...base,
      reputation: adjustReputation(base.reputation, "market", 40),
    };
    expect(hasCondition(deriveWorldState(liked), "market-favoured")).toBe(true);
    expect(hasCondition(deriveWorldState(base), "market-favoured")).toBe(false);
  });

  it("stacks the whole legacy of a finished run", () => {
    const finished = makeState({
      "spike-delivered": true,
      "act1-complete": true,
      "act1-outcome": "court",
      "cordon-broken": true,
      "undercroft-charter": true,
      "wanted-by-auric": false,
      "game-complete": true,
    });
    expect(earned(finished)).toEqual([
      "package-delivered",
      "court-ascendant",
      "cordon-broken",
      "charter-signed",
      "city-settled",
    ]);
  });

  it("reports conditions in the catalog's authored order, whatever the flags", () => {
    const a = deriveWorldState(
      makeState({ "game-complete": true, "cordon-broken": true }),
    );
    const b = deriveWorldState(
      makeState({ "cordon-broken": true, "game-complete": true }),
    );
    expect(a.conditions).toEqual(b.conditions);
  });

  it("never mutates the state it reads", () => {
    const state = makeState({ "cordon-broken": true });
    const before = JSON.stringify(state);
    deriveWorldState(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("conditionsAllow", () => {
  const world = worldOf("cordon-broken", "warrant-out");

  it("passes a rule that asks for nothing", () => {
    expect(conditionsAllow(world, {})).toBe(true);
    expect(conditionsAllow(EMPTY_WORLD, {})).toBe(true);
  });

  it("needs every required condition, not just one", () => {
    expect(conditionsAllow(world, { requires: ["cordon-broken"] })).toBe(true);
    expect(
      conditionsAllow(world, { requires: ["cordon-broken", "warrant-out"] }),
    ).toBe(true);
    expect(
      conditionsAllow(world, { requires: ["cordon-broken", "city-settled"] }),
    ).toBe(false);
  });

  it("is closed by any one excluded condition", () => {
    expect(conditionsAllow(world, { absent: ["city-settled"] })).toBe(true);
    expect(conditionsAllow(world, { absent: ["warrant-out"] })).toBe(false);
    expect(
      conditionsAllow(world, {
        requires: ["cordon-broken"],
        absent: ["warrant-out"],
      }),
    ).toBe(false);
  });
});
