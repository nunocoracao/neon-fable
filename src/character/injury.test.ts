import { describe, expect, it } from "vitest";
import { injuries, requireInjury } from "../data/injuries";
import {
  NO_INJURY,
  characterInjury,
  characterInjuryModifiers,
  healCharacter,
  injuryDef,
  injuryModifiers,
  injureCharacter,
  normalizeInjury,
  takeInjury,
  tickCharacterInjury,
  tickInjury,
  worseInjury,
} from "./injury";
import { fixtureCharacter } from "./testSupport";

/**
 * The rules a single carried injury follows, asserted without a fight,
 * a clinic, or a GameState anywhere near them — which is the point of
 * keeping them here: the player's wound and a companion's are the same
 * code, so proving it once proves it for both.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";
const SERVO = "inj-servo-lock";

describe("injuryModifiers", () => {
  it("folds nothing to nothing", () => {
    expect(injuryModifiers(null)).toEqual(NO_INJURY);
    expect(injuryModifiers(undefined)).toEqual(NO_INJURY);
    expect(characterInjuryModifiers(fixtureCharacter())).toEqual(NO_INJURY);
  });

  it("ignores an injury id this build no longer has", () => {
    expect(injuryModifiers({ id: "inj-nonexistent", scenesLeft: 2 })).toEqual(
      NO_INJURY,
    );
    expect(injuryDef({ id: "inj-nonexistent", scenesLeft: 2 })).toBeNull();
  });

  it("reads every injury in the pool as a real set of figures", () => {
    for (const injury of injuries) {
      expect(injuryModifiers({ id: injury.id, scenesLeft: 1 })).not.toEqual(
        NO_INJURY,
      );
    }
  });

  it("carries each authored figure through to its own field", () => {
    expect(injuryModifiers({ id: WINGED, scenesLeft: 1 }).effects).toEqual([
      { type: "stat-mod", stat: "reflexes", amount: -1 },
    ]);
    expect(injuryModifiers({ id: CONCUSSED, scenesLeft: 1 }).dialogueCool).toBe(
      2,
    );
    expect(injuryModifiers({ id: SERVO, scenesLeft: 1 }).chromeOffline).toBe(
      true,
    );
  });
});

describe("worst replaces", () => {
  it("takes any injury when carrying none", () => {
    expect(worseInjury(null, WINGED)).toBe(true);
    expect(takeInjury(null, WINGED)).toEqual({
      id: WINGED,
      scenesLeft: requireInjury(WINGED).scenes,
    });
  });

  it("replaces a lesser wound with a worse one", () => {
    const carried = takeInjury(null, WINGED);
    expect(worseInjury(carried, SERVO)).toBe(true);
    expect(takeInjury(carried, SERVO)?.id).toBe(SERVO);
  });

  it("shrugs off a lesser wound while carrying a worse one", () => {
    const carried = takeInjury(null, SERVO);
    expect(worseInjury(carried, WINGED)).toBe(false);
    expect(takeInjury(carried, WINGED)).toBe(carried);
  });

  it("does not reset the clock when the same wound lands twice", () => {
    const carried = tickInjury(takeInjury(null, WINGED), 1)!;
    expect(carried.scenesLeft).toBe(requireInjury(WINGED).scenes - 1);
    expect(takeInjury(carried, WINGED)).toBe(carried);
  });

  it("never stacks: taking a second injury leaves exactly one", () => {
    let carried = takeInjury(null, WINGED);
    carried = takeInjury(carried, CONCUSSED);
    carried = takeInjury(carried, SERVO);
    expect(carried?.id).toBe(SERVO);
  });

  it("changes nothing for an id this build no longer has", () => {
    const carried = takeInjury(null, WINGED);
    expect(takeInjury(carried, "inj-nonexistent")).toBe(carried);
    expect(takeInjury(null, "inj-nonexistent")).toBeNull();
  });
});

describe("time passing", () => {
  it("counts the wound down and closes it at zero", () => {
    const scenes = requireInjury(WINGED).scenes;
    let carried = takeInjury(null, WINGED);
    for (let i = 1; i < scenes; i++) {
      carried = tickInjury(carried);
      expect(carried?.scenesLeft).toBe(scenes - i);
    }
    expect(tickInjury(carried)).toBeNull();
  });

  it("closes a wound outright when handed more moves than it has left", () => {
    expect(tickInjury(takeInjury(null, WINGED), 99)).toBeNull();
  });

  it("leaves an unhurt character alone", () => {
    expect(tickInjury(null)).toBeNull();
    const character = fixtureCharacter();
    expect(tickCharacterInjury(character)).toBe(character);
  });

  it("closes a wound whose content this build dropped", () => {
    expect(tickInjury({ id: "inj-nonexistent", scenesLeft: 9 })).toBeNull();
  });
});

describe("carrier helpers", () => {
  it("writes a wound onto a character and takes it off again", () => {
    const hurt = injureCharacter(fixtureCharacter(), CONCUSSED);
    expect(characterInjury(hurt)?.id).toBe(CONCUSSED);
    expect(characterInjury(healCharacter(hurt))).toBeNull();
  });

  it("returns the same character when nothing changed", () => {
    const clean = fixtureCharacter();
    expect(healCharacter(clean)).toBe(clean);
    const hurt = injureCharacter(clean, SERVO);
    expect(injureCharacter(hurt, WINGED)).toBe(hurt);
  });
});

describe("normalizeInjury", () => {
  it("drops a wound this build has no content for", () => {
    expect(normalizeInjury({ id: "inj-nonexistent", scenesLeft: 2 })).toBeNull();
    expect(normalizeInjury(null)).toBeNull();
  });

  it("clamps a hand-edited clock back into what content allows", () => {
    expect(normalizeInjury({ id: WINGED, scenesLeft: 99 })).toEqual({
      id: WINGED,
      scenesLeft: requireInjury(WINGED).scenes,
    });
    expect(normalizeInjury({ id: WINGED, scenesLeft: 0 })).toEqual({
      id: WINGED,
      scenesLeft: 1,
    });
    expect(
      normalizeInjury({ id: WINGED, scenesLeft: Number.NaN }),
    ).toEqual({ id: WINGED, scenesLeft: requireInjury(WINGED).scenes });
  });

  it("leaves a sound record exactly as it was", () => {
    expect(normalizeInjury({ id: CONCUSSED, scenesLeft: 2 })).toEqual({
      id: CONCUSSED,
      scenesLeft: 2,
    });
  });
});
