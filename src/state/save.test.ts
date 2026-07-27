import { describe, expect, it } from "vitest";
import { createNewGame, GAME_STATE_VERSION } from "./gameState";
import { setFlag } from "./flags";
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
