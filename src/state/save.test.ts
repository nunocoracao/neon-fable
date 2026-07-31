import { describe, expect, it } from "vitest";
import { composeCharacter, defaultAppearance } from "../character";
import { fixtureAppearance, fixtureCharacter } from "../character/testSupport";
import { createNewGame, GAME_STATE_VERSION } from "./gameState";
import { setFlag } from "./flags";
import { bandOf, emptyReputation } from "./reputation";
import {
  SAVE_SLOTS,
  SaveError,
  createMemoryStorage,
  deleteSave,
  listSaves,
  loadGame,
  mostRecentSave,
  saveGame,
} from "./save";

/**
 * A verbatim mid-run v6 save state, exactly as the game wrote it before
 * the appearance migration (no `player.appearance`). Frozen as data on
 * purpose — never regenerate it from current code.
 */
const V6_SAVE_STATE = {
  version: 6,
  player: {
    name: "Sable",
    backgroundId: "grid-diver",
    stats: { body: 6, reflexes: 6, tech: 9, cool: 6, intelligence: 7 },
    derived: {
      maxHp: 31,
      initiative: 6,
      neuralCapacity: 9,
      meleeDamageBonus: 1,
      rangedDamageBonus: 1,
    },
    hp: 29,
    neuralLoad: 3,
    equipment: {
      weapon: "wpn-stun-baton",
      outfit: "out-diver-harness",
      enhancements: { neural: "cyb-lattice-coprocessor" },
    },
    tags: ["net", "diver"],
    advancement: { pointsSpent: 1, abilityIds: ["ability-overclock-burst"] },
  },
  flags: { metFixer: true, "act1:complete": true },
  location: "hub:market",
  inventory: { stacks: [{ itemId: "con-trauma-patch", quantity: 2 }] },
  credits: 180,
  pendingEncounterId: null,
  rng: { seed: 987654 },
};

/**
 * A verbatim v8 save — the last shape before factions existed — taken
 * from a run that stood with the Cistern Court through two chapters and
 * walked the Vertical Market's courier chain to the boards. Frozen as
 * data: it is the evidence that a finished playthrough arrives with the
 * standing it earned rather than at nothing.
 */
const V8_COURT_SAVE_STATE = {
  version: 8,
  player: {
    name: "Wick",
    backgroundId: "gutter-courier",
    stats: { body: 7, reflexes: 8, tech: 6, cool: 6, intelligence: 6 },
    derived: {
      maxHp: 33,
      initiative: 8,
      neuralCapacity: 8,
      meleeDamageBonus: 1,
      rangedDamageBonus: 1,
    },
    hp: 33,
    neuralLoad: 0,
    appearance: {
      skinTone: "warm-brown",
      build: "lean",
      hairStyle: "buzz",
      hairColor: "raven",
      eyes: "standard",
      eyeColor: "amber",
      brows: "straight",
      mouth: "neutral",
      faceDetail: "none",
      headwear: "none",
    },
    equipment: {
      weapon: "wpn-stun-baton",
      outfit: "out-courier-slicker",
      enhancements: {},
    },
    tags: ["street", "courier"],
    advancement: { pointsSpent: 0, abilityIds: [] },
  },
  flags: {
    "act1-side": "court",
    "court-oath": true,
    "act1-outcome": "court",
    "ally-cistern-court": true,
    "undertow-stopped": true,
    "act1-complete": true,
    "act2-outcome": "severance",
    "undercroft-severed": true,
    "steps-independent": true,
    "act2-complete": true,
    "last-mile": "exposed",
    "last-mile-exposed": true,
  },
  location: "greywater-steps",
  inventory: { stacks: [{ itemId: "con-trauma-patch", quantity: 1 }] },
  credits: 210,
  pendingEncounterId: null,
  party: { members: [] },
  rng: { seed: 4242 },
};

function makeState() {
  const state = createNewGame({ playerName: "Vex", seed: 42 });
  state.location = "hub:market";
  setFlag(state, "metFixer", true);
  setFlag(state, "credits", 250);
  return state;
}

describe("save system", () => {
  it("round-trips a GameState through save and load", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    saveGame(state, "slot1", storage, 1000);
    expect(loadGame("slot1", storage)).toEqual(state);
  });

  it("round-trips a customized appearance and its composed descriptor", () => {
    const storage = createMemoryStorage();
    const appearance = fixtureAppearance({
      skinTone: "deep-umber",
      build: "heavy",
      hairStyle: "locs",
      hairColor: "silver",
      eyes: "cyber-band",
      eyeColor: "magenta",
      faceDetail: "cyber-lines",
      headwear: "hood",
    });
    const state = createNewGame({
      character: fixtureCharacter({ appearance }),
      seed: 5,
    });
    saveGame(state, "slot1", storage, 1000);
    const loaded = loadGame("slot1", storage);
    expect(loaded.player.appearance).toEqual(appearance);
    // The loaded character resolves to the identical render descriptor:
    // same layers, same remaps, same build — pixel-for-pixel the same
    // sprite as before the save (starting gear included).
    expect(
      composeCharacter(loaded.player.appearance, loaded.player.equipment),
    ).toEqual(composeCharacter(appearance, state.player.equipment));
  });

  it("supports three named slots plus autosave independently", () => {
    const storage = createMemoryStorage();
    for (const [i, slot] of SAVE_SLOTS.entries()) {
      const state = createNewGame({ playerName: `Runner ${i}`, seed: i });
      saveGame(state, slot, storage, i);
    }
    for (const [i, slot] of SAVE_SLOTS.entries()) {
      expect(loadGame(slot, storage).player.name).toBe(`Runner ${i}`);
    }
  });

  it("listSaves returns metadata for occupied slots only", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot2", storage, 5000);
    const saves = listSaves(storage);
    expect(saves).toEqual([
      {
        slot: "slot2",
        savedAt: 5000,
        characterName: "Vex",
        location: "hub:market",
      },
    ]);
  });

  it("listSaves skips corrupt slots instead of throwing", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 1);
    storage.setItem("neon-fable:save:slot2", "{not json");
    storage.setItem("neon-fable:save:slot3", JSON.stringify({ wrong: true }));
    expect(listSaves(storage).map((s) => s.slot)).toEqual(["slot1"]);
  });

  it("deleteSave empties the slot", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage);
    deleteSave("slot1", storage);
    expect(listSaves(storage)).toEqual([]);
    expect(() => loadGame("slot1", storage)).toThrow(SaveError);
  });

  it("loading an empty slot fails with a 'missing' error", () => {
    const storage = createMemoryStorage();
    try {
      loadGame("slot3", storage);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe("missing");
    }
  });

  it("loading invalid JSON fails with a 'corrupt' error", () => {
    const storage = createMemoryStorage();
    storage.setItem("neon-fable:save:slot1", "garbage{{{");
    try {
      loadGame("slot1", storage);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe("corrupt");
    }
  });

  it("loading a malformed envelope fails with a 'corrupt' error", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: GAME_STATE_VERSION, savedAt: 1, state: { nope: 1 } }),
    );
    try {
      loadGame("slot1", storage);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as SaveError).code).toBe("corrupt");
    }
  });

  it("mostRecentSave picks the newest save by savedAt", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 100);
    saveGame(makeState(), "autosave", storage, 300);
    saveGame(makeState(), "slot2", storage, 200);
    expect(mostRecentSave(listSaves(storage))?.slot).toBe("autosave");
  });

  it("mostRecentSave returns null when no saves exist", () => {
    expect(mostRecentSave([])).toBeNull();
  });

  it("migrates a v6 (pre-appearance) save to the current version", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 6, savedAt: 777, state: V6_SAVE_STATE }),
    );

    const loaded = loadGame("slot1", storage);
    expect(loaded.version).toBe(GAME_STATE_VERSION);
    expect(loaded.player.appearance).toEqual(defaultAppearance());
    // Everything else survives untouched.
    expect(loaded.player.name).toBe("Sable");
    expect(loaded.player.hp).toBe(29);
    expect(loaded.player.equipment.enhancements.neural).toBe(
      "cyb-lattice-coprocessor",
    );
    expect(loaded.flags["metFixer"]).toBe(true);
    expect(loaded.credits).toBe(180);
    expect(loaded.rng).toEqual({ seed: 987654 });
    // The migrated look composes with the save's own v6 gear: the render
    // descriptor derives without error and shows the equipped outfit.
    const composed = composeCharacter(
      loaded.player.appearance,
      loaded.player.equipment,
    );
    expect(composed.layers.some((layer) => layer.slot === "outfit")).toBe(true);
  });

  it("gives a v6 save a party and a standing it never had", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 6, savedAt: 777, state: V6_SAVE_STATE }),
    );
    const loaded = loadGame("slot1", storage);
    // Nothing in that run's flags is worth anything to anybody, so it
    // loads at nothing — present and empty, never undefined.
    expect(loaded.party).toEqual({ members: [] });
    expect(loaded.reputation).toEqual(emptyReputation());
  });

  it("derives a v8 save's standing from the outcomes it recorded", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 8, savedAt: 999, state: V8_COURT_SAVE_STATE }),
    );

    const loaded = loadGame("slot1", storage);
    expect(loaded.version).toBe(GAME_STATE_VERSION);
    // court-oath 12 + Act 1 with the Court 25 + severance 25 + the
    // boards' half of the exposed courier case 6.
    expect(loaded.reputation.standing.court).toBe(68);
    expect(bandOf(loaded.reputation, "court").id).toBe("trusted");
    // Two chapters against the Combine, plus a case it wanted quiet.
    expect(bandOf(loaded.reputation, "auric").id).toBe("cold");
    expect(loaded.reputation.standing.market).toBe(2);
    // Everything the save already carried is untouched.
    expect(loaded.player.name).toBe("Wick");
    expect(loaded.credits).toBe(210);
    expect(loaded.flags["act2-outcome"]).toBe("severance");
    expect(loaded.party).toEqual({ members: [] });
  });

  it("a migrated v8 save round-trips through save and load", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 8, savedAt: 999, state: V8_COURT_SAVE_STATE }),
    );
    const migrated = loadGame("slot1", storage);
    saveGame(migrated, "slot2", storage, 1000);
    expect(loadGame("slot2", storage)).toEqual(migrated);
  });

  it("a migrated v6 save round-trips through save and load", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 6, savedAt: 777, state: V6_SAVE_STATE }),
    );
    const migrated = loadGame("slot1", storage);
    saveGame(migrated, "slot2", storage, 888);
    expect(loadGame("slot2", storage)).toEqual(migrated);
  });

  it("saves older than the migration floor fail with 'version-mismatch'", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 5, savedAt: 1, state: V6_SAVE_STATE }),
    );
    try {
      loadGame("slot1", storage);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe("version-mismatch");
    }
  });

  it("loading a future save version fails with a 'version-mismatch' error", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    state.version = GAME_STATE_VERSION + 1;
    saveGame(state, "slot1", storage, 1);
    try {
      loadGame("slot1", storage);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SaveError);
      expect((error as SaveError).code).toBe("version-mismatch");
      expect((error as SaveError).message).toMatch(/version/);
    }
  });
});
