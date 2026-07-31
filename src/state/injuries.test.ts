import { describe, expect, it } from "vitest";
import { characterInjury, injureCharacter } from "../character/injury";
import { requireInjury } from "../data/injuries";
import { applyEffects } from "../narrative/effects";
import {
  GAME_STATE_VERSION,
  createNewGame,
  migrateGameState,
  type GameState,
} from "./gameState";
import {
  advanceInjuries,
  canTreatInjury,
  carriedInjury,
  treatInjury,
  treatmentFee,
} from "./injuries";
import {
  companionInjury,
  recruitCompanion,
  setCompanionInjury,
} from "./party";
import { createMemoryStorage, loadGame, saveGame } from "./save";

/**
 * The two ways an injury ends — walking it off, and paying for it —
 * plus the promise the whole feature rests on: it does end.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";

function hurtRun(injuryId = WINGED): GameState {
  const state = createNewGame({ playerName: "Vex", seed: 4 });
  return { ...state, player: injureCharacter(state.player, injuryId) };
}

function withVesper(state: GameState, injuryId: string | null): GameState {
  const party = recruitCompanion(state.party, "vesper");
  return {
    ...state,
    party:
      injuryId === null
        ? party
        : setCompanionInjury(party, "vesper", {
            id: injuryId,
            scenesLeft: requireInjury(injuryId).scenes,
          }),
  };
}

describe("carriedInjury", () => {
  it("reads the player by default and a companion when named", () => {
    const state = withVesper(hurtRun(), CONCUSSED);
    expect(carriedInjury(state)?.id).toBe(WINGED);
    expect(carriedInjury(state, { companionId: "vesper" })?.id).toBe(CONCUSSED);
  });

  it("reads nothing off somebody this run never recruited", () => {
    expect(carriedInjury(hurtRun(), { companionId: "vesper" })).toBeNull();
  });
});

describe("walking it off", () => {
  it("closes after exactly the moves content authored", () => {
    const scenes = requireInjury(WINGED).scenes;
    let state = hurtRun();
    for (let i = 1; i < scenes; i++) {
      state = advanceInjuries(state);
      expect(characterInjury(state.player)?.scenesLeft).toBe(scenes - i);
    }
    state = advanceInjuries(state);
    expect(characterInjury(state.player)).toBeNull();
  });

  it("heals the crew alongside the player, benched or not", () => {
    let state = withVesper(hurtRun(), CONCUSSED);
    state = {
      ...state,
      party: {
        ...state.party,
        members: state.party.members.map((m) => ({ ...m, active: false })),
      },
    };
    state = advanceInjuries(state, requireInjury(CONCUSSED).scenes);
    expect(companionInjury(state.party, "vesper")).toBeNull();
  });

  it("is a no-op for a run nobody is hurt on", () => {
    const state = createNewGame({ seed: 4 });
    expect(advanceInjuries(state)).toBe(state);
  });

  it("is driven by the travel effect, and by nothing else", () => {
    const state = hurtRun();
    const scenes = requireInjury(WINGED).scenes;

    // A choice that only sets a flag leaves the wound exactly as it was.
    const idle = applyEffects(state, [
      { type: "set-flag", key: "nothing-happened", value: true },
    ]);
    expect(characterInjury(idle.player)?.scenesLeft).toBe(scenes);

    // Crossing the city moves it on.
    const moved = applyEffects(state, [
      { type: "travel", mapId: "greywater-steps" },
    ]);
    expect(moved.location).toBe("greywater-steps");
    expect(characterInjury(moved.player)?.scenesLeft).toBe(scenes - 1);
  });
});

describe("the clinic", () => {
  it("quotes the injury's own fee, and nothing for somebody unhurt", () => {
    const state = hurtRun();
    expect(treatmentFee(state)).toBe(requireInjury(WINGED).treatCost);
    expect(treatmentFee(createNewGame({ seed: 4 }))).toBe(0);
  });

  it("refuses when the credits are short, and changes nothing", () => {
    const broke: GameState = { ...hurtRun(), credits: 0 };
    expect(canTreatInjury(broke)).toBe(false);
    expect(treatInjury(broke)).toBe(broke);
  });

  it("refuses when there is nothing to treat", () => {
    const clean = createNewGame({ seed: 4 });
    expect(canTreatInjury(clean)).toBe(false);
    expect(treatInjury(clean)).toBe(clean);
  });

  it("closes the wound and takes exactly the fee", () => {
    const fee = requireInjury(WINGED).treatCost;
    const state: GameState = { ...hurtRun(), credits: fee + 10 };
    expect(canTreatInjury(state)).toBe(true);
    const after = treatInjury(state);
    expect(characterInjury(after.player)).toBeNull();
    expect(after.credits).toBe(10);
  });

  it("treats a companion off the same purse", () => {
    const fee = requireInjury(CONCUSSED).treatCost;
    const state: GameState = {
      ...withVesper(createNewGame({ seed: 4 }), CONCUSSED),
      credits: fee,
    };
    const after = treatInjury(state, { companionId: "vesper" });
    expect(companionInjury(after.party, "vesper")).toBeNull();
    expect(after.credits).toBe(0);
  });

  it("leaves the player alone when the crew is the one being treated", () => {
    const fee = requireInjury(CONCUSSED).treatCost;
    const state: GameState = {
      ...withVesper(hurtRun(), CONCUSSED),
      credits: fee,
    };
    const after = treatInjury(state, { companionId: "vesper" });
    expect(companionInjury(after.party, "vesper")).toBeNull();
    expect(characterInjury(after.player)?.id).toBe(WINGED);
  });

  it("is reachable through the narrative effect, fee and all", () => {
    const fee = requireInjury(WINGED).treatCost;
    const state: GameState = { ...hurtRun(), credits: fee };
    const after = applyEffects(state, [{ type: "treat-injury" }]);
    expect(characterInjury(after.player)).toBeNull();
    expect(after.credits).toBe(0);
  });

  it("charges nothing through the effect when it cannot help", () => {
    const state: GameState = { ...hurtRun(), credits: 5 };
    const after = applyEffects(state, [{ type: "treat-injury" }]);
    expect(characterInjury(after.player)?.id).toBe(WINGED);
    expect(after.credits).toBe(5);
  });
});

describe("saves", () => {
  it("round-trips a wound on the player and on the crew", () => {
    const storage = createMemoryStorage();
    const state = withVesper(hurtRun(), CONCUSSED);
    saveGame(state, "slot1", storage);
    const loaded = loadGame("slot1", storage);
    expect(characterInjury(loaded.player)).toEqual(characterInjury(state.player));
    expect(companionInjury(loaded.party, "vesper")).toEqual(
      companionInjury(state.party, "vesper"),
    );
  });

  it("round-trips a run where nobody is hurt", () => {
    const storage = createMemoryStorage();
    const state = withVesper(createNewGame({ seed: 4 }), null);
    saveGame(state, "slot1", storage);
    const loaded = loadGame("slot1", storage);
    expect(characterInjury(loaded.player)).toBeNull();
    expect(companionInjury(loaded.party, "vesper")).toBeNull();
  });

  it("closes a wound whose content this build no longer has", () => {
    const state = withVesper(createNewGame({ seed: 4 }), CONCUSSED);
    const stale: GameState = {
      ...state,
      player: { ...state.player, injury: { id: "inj-retired", scenesLeft: 3 } },
      party: setCompanionInjury(state.party, "vesper", {
        id: "inj-retired",
        scenesLeft: 3,
      }),
    };
    const migrated = migrateGameState(stale, GAME_STATE_VERSION - 1);
    expect(characterInjury(migrated.player)).toBeNull();
    expect(companionInjury(migrated.party, "vesper")).toBeNull();
  });

  it("brings an older save forward as somebody carrying nothing", () => {
    const state = createNewGame({ seed: 4 });
    const old = { ...state, version: GAME_STATE_VERSION - 1 };
    const migrated = migrateGameState(old, GAME_STATE_VERSION - 1);
    expect(migrated.version).toBe(GAME_STATE_VERSION);
    expect(characterInjury(migrated.player)).toBeNull();
  });
});
