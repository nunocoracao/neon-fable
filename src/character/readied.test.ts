import { describe, expect, it } from "vitest";
import type { TimedEffect } from "../inventory/items";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "../state/gameState";
import { createMemoryStorage, loadGame, saveGame } from "../state/save";
import { clearReadied, normalizeReadied, readiedEffects, readyEffect } from "./readied";
import { fixtureCharacter } from "./testSupport";

/**
 * What somebody is carrying into their next fight, and the promise the
 * whole thing rests on: an old save is somebody who has not eaten, and
 * a held-over lift naming content this build no longer has stops being
 * carried rather than riding along forever.
 */

const skewer: TimedEffect = {
  family: "well-fed",
  stat: "body",
  amount: 1,
  turns: 3,
};

const tea: TimedEffect = {
  family: "well-fed",
  stat: "reflexes",
  amount: 1,
  turns: 6,
};

describe("readied effects", () => {
  it("starts empty and reads as nothing", () => {
    expect(readiedEffects(fixtureCharacter())).toEqual([]);
  });

  it("keeps one meal: the second replaces the first", () => {
    const fed = readyEffect(readyEffect(fixtureCharacter(), skewer), tea);
    expect(readiedEffects(fed)).toEqual([tea]);
  });

  it("clears back to the shape of somebody who has not eaten", () => {
    const fed = readyEffect(fixtureCharacter(), skewer);
    const spent = clearReadied(fed);
    expect(readiedEffects(spent)).toEqual([]);
    // Absent, not an empty array: exactly what an older save says.
    expect("readied" in spent).toBe(false);
    // And clearing nothing changes nothing at all.
    const untouched = fixtureCharacter();
    expect(clearReadied(untouched)).toBe(untouched);
  });
});

describe("normalizeReadied", () => {
  it("reads nothing as nothing", () => {
    expect(normalizeReadied(undefined)).toBeUndefined();
    expect(normalizeReadied([])).toBeUndefined();
    expect(normalizeReadied("noodles")).toBeUndefined();
  });

  it("drops entries naming content this build no longer has", () => {
    expect(
      normalizeReadied([
        { family: "retired-family", stat: "body", amount: 1, turns: 3 },
        { family: "well-fed", stat: "charisma", amount: 1, turns: 3 },
        { family: "well-fed", stat: "body", amount: 0, turns: 3 },
      ]),
    ).toBeUndefined();
  });

  it("clamps a duration a fight could not count down", () => {
    expect(
      normalizeReadied([{ family: "well-fed", stat: "body", amount: 1, turns: 0 }]),
    ).toEqual([{ family: "well-fed", stat: "body", amount: 1, turns: 1 }]);
  });

  it("keeps one entry per family even from a badly written save", () => {
    expect(normalizeReadied([skewer, tea])).toEqual([tea]);
  });

  it("carries a real after-cost through and drops a broken one", () => {
    const withCost = normalizeReadied([
      { ...skewer, after: { stat: "body", amount: -1, turns: 2 } },
    ]);
    expect(withCost?.[0]?.after).toEqual({
      stat: "body",
      amount: -1,
      turns: 2,
    });
    const broken = normalizeReadied([
      { ...skewer, after: { stat: "nonsense", amount: -1, turns: 2 } },
    ]);
    expect(broken?.[0]?.after).toBeUndefined();
  });
});

describe("save compatibility", () => {
  it("brings an older save forward as somebody who has not eaten", () => {
    const state = createNewGame({ seed: 4 });
    const migrated = migrateGameState(
      { ...state, version: GAME_STATE_VERSION - 1 },
      GAME_STATE_VERSION - 1,
    );
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    expect(readiedEffects(migrated.player)).toEqual([]);
  });

  it("closes out a meal whose family this build retired", () => {
    const state = createNewGame({ seed: 4 });
    const stale = {
      ...state,
      player: {
        ...state.player,
        readied: [
          { family: "retired", stat: "body", amount: 2, turns: 4 },
        ] as unknown as TimedEffect[],
      },
    };
    const migrated = migrateGameState(stale, GAME_STATE_VERSION - 1);
    expect(readiedEffects(migrated.player)).toEqual([]);
  });

  it("survives a round trip through a save slot", () => {
    const state: GameState = createNewGame({ seed: 4 });
    const fed: GameState = {
      ...state,
      player: readyEffect(state.player, tea),
    };
    const storage = createMemoryStorage();
    saveGame(fed, "slot1", storage);
    expect(readiedEffects(loadGame("slot1", storage).player)).toEqual([tea]);
  });
});
