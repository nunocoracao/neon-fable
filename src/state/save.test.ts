import { describe, expect, it } from "vitest";
import { composeCharacter, defaultAppearance } from "../character";
import { fixtureAppearance, fixtureCharacter } from "../character/testSupport";
import { createNewGame, GAME_STATE_VERSION } from "./gameState";
import { noAssists } from "../data/assists";
import { setFlag } from "./flags";
import { bandOf, emptyReputation } from "./reputation";
import {
  SAVE_LABEL_MAX_LENGTH,
  SAVE_SLOTS,
  SAVE_THUMBNAIL_MAX_BYTES,
  SaveError,
  createMemoryStorage,
  deleteSave,
  listSaves,
  loadGame,
  mostRecentSave,
  readSaveSlot,
  readSaveSlots,
  renameSave,
  sanitizeSaveLabel,
  sanitizeThumbnail,
  saveGame,
  summarizeRun,
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
        label: "",
        thumbnails: { portrait: null, scene: null },
        run: {
          characterName: "Vex",
          backgroundId: "gutter-courier",
          location: "hub:market",
          act: 1,
          difficulty: "grind",
          difficultyChanged: false,
          newGamePlus: false,
          shardsFound: 0,
          victories: 0,
        },
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

/** A one-pixel PNG: shape-valid, tiny, and obviously not a real bake. */
const PIXEL_PNG = "data:image/png;base64,iVBORw0KGgo=";
const PIXEL_WEBP = "data:image/webp;base64,UklGRhoAAABXRUJQ";

function thumbs(portrait: string | null, scene: string | null = null) {
  return { portrait, scene };
}

describe("save metadata", () => {
  it("round-trips a label and both thumbnails", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 1000, {
      label: "Before the Undercroft",
      thumbnails: thumbs(PIXEL_PNG, PIXEL_WEBP),
    });

    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("ready");
    expect(record.label).toBe("Before the Undercroft");
    expect(record.thumbnails).toEqual(thumbs(PIXEL_PNG, PIXEL_WEBP));
    expect(record.savedAt).toBe(1000);
  });

  it("summarizes the run off the state, never off what was stored", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    setFlag(state, "act1-complete", true);
    setFlag(state, "ng-plus", true);
    setFlag(state, "combat:enc-underpass", "victory");
    setFlag(state, "combat:enc-rooftop", "victory");
    setFlag(state, "combat:enc-market", "fled");
    state.lore = { collected: ["shard-a", "shard-b", "shard-c"] };
    state.rules = {
      difficulty: "blackout",
      assists: noAssists(),
      difficultyChanged: true,
    };
    saveGame(state, "slot1", storage, 1);

    expect(readSaveSlot("slot1", storage).run).toEqual({
      characterName: "Vex",
      backgroundId: "gutter-courier",
      location: "hub:market",
      act: 2,
      difficulty: "blackout",
      difficultyChanged: true,
      newGamePlus: true,
      shardsFound: 3,
      victories: 2,
    });
  });

  it("caps and cleans a player-entered label on the way in", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 1, {
      label: `  the   long\n\twalk home  ${"x".repeat(80)}`,
    });
    const stored = readSaveSlot("slot1", storage).label;
    expect(stored.length).toBe(SAVE_LABEL_MAX_LENGTH);
    expect(stored.startsWith("the long walk home ")).toBe(true);
    expect(stored).not.toMatch(/[\n\t]/);
  });

  it("sanitizeSaveLabel treats anything that is not a string as no label", () => {
    expect(sanitizeSaveLabel(undefined)).toBe("");
    expect(sanitizeSaveLabel(42)).toBe("");
    expect(sanitizeSaveLabel("   ")).toBe("");
    expect(sanitizeSaveLabel("Run 2")).toBe("Run 2");
  });

  it("drops a thumbnail that is oversized or not an image data URL", () => {
    const storage = createMemoryStorage();
    const huge = `data:image/png;base64,${"A".repeat(SAVE_THUMBNAIL_MAX_BYTES)}`;
    saveGame(makeState(), "slot1", storage, 1, {
      thumbnails: thumbs(huge, "javascript:alert(1)"),
    });
    expect(readSaveSlot("slot1", storage).thumbnails).toEqual(thumbs(null, null));

    expect(sanitizeThumbnail("https://example.invalid/face.png")).toBeNull();
    expect(sanitizeThumbnail("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(sanitizeThumbnail(PIXEL_PNG)).toBe(PIXEL_PNG);
  });

  it("re-sanitizes on the way out, so a hand-edited slot cannot inject a URL", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 1);
    const raw = JSON.parse(storage.getItem("neon-fable:save:slot1")!);
    raw.meta = {
      label: { nope: true },
      thumbnails: { portrait: "https://tracker.invalid/pixel.png", scene: 7 },
    };
    storage.setItem("neon-fable:save:slot1", JSON.stringify(raw));

    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("ready");
    expect(record.label).toBe("");
    expect(record.thumbnails).toEqual(thumbs(null, null));
  });

  it("loads a save whose metadata block is nonsense", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    saveGame(state, "slot1", storage, 1);
    const raw = JSON.parse(storage.getItem("neon-fable:save:slot1")!);
    raw.meta = "not an object at all";
    storage.setItem("neon-fable:save:slot1", JSON.stringify(raw));

    expect(loadGame("slot1", storage)).toEqual(state);
    expect(readSaveSlot("slot1", storage).status).toBe("ready");
  });

  it("gives a save written before metadata existed an empty one", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 6, savedAt: 777, state: V6_SAVE_STATE }),
    );

    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("ready");
    expect(record.label).toBe("");
    expect(record.thumbnails).toEqual(thumbs(null, null));
    // Everything the card actually shows still resolves — off the v6
    // state, unmigrated, exactly as it was written.
    expect(record.run).toEqual({
      characterName: "Sable",
      backgroundId: "grid-diver",
      location: "hub:market",
      act: 1,
      difficulty: "grind",
      difficultyChanged: false,
      newGamePlus: false,
      shardsFound: 0,
      victories: 0,
    });
  });

  it("reads a v8 save's chapter off the flags it already carried", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot2",
      JSON.stringify({ version: 8, savedAt: 999, state: V8_COURT_SAVE_STATE }),
    );
    const record = readSaveSlot("slot2", storage);
    expect(record.run?.act).toBe(3);
    expect(record.run?.characterName).toBe("Wick");
    expect(record.run?.location).toBe("greywater-steps");
    expect(record.run?.difficulty).toBe("grind");
  });

  it("summarizeRun tolerates a state missing every optional record", () => {
    const bare = {
      version: 6,
      player: { name: "Ghost" },
      flags: {},
      location: "hub:market",
    } as unknown as Parameters<typeof summarizeRun>[0];
    expect(summarizeRun(bare)).toEqual({
      characterName: "Ghost",
      backgroundId: "",
      location: "hub:market",
      act: 1,
      difficulty: "grind",
      difficultyChanged: false,
      newGamePlus: false,
      shardsFound: 0,
      victories: 0,
    });
  });
});

describe("reading every slot", () => {
  it("reports an empty slot as empty, with nothing invented", () => {
    const record = readSaveSlot("slot3", createMemoryStorage());
    expect(record).toEqual({
      slot: "slot3",
      status: "empty",
      savedAt: 0,
      label: "",
      thumbnails: thumbs(null, null),
      run: null,
      error: null,
    });
  });

  it("returns a record for all four slots whatever shape they are in", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 10);
    storage.setItem("neon-fable:save:slot2", "{not json");
    storage.setItem("neon-fable:save:slot3", JSON.stringify({ wrong: true }));

    const records = readSaveSlots(storage);
    expect(records.map((r) => r.slot)).toEqual([...SAVE_SLOTS]);
    expect(records.map((r) => r.status)).toEqual([
      "ready",
      "unreadable",
      "unreadable",
      "empty",
    ]);
    expect(records[1]?.error?.code).toBe("corrupt");
    expect(records[1]?.run).toBeNull();
  });

  it("keeps the metadata of a slot whose state is unreadable", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({
        version: GAME_STATE_VERSION,
        savedAt: 4321,
        state: { nope: 1 },
        meta: { label: "Night before", thumbnails: thumbs(PIXEL_PNG) },
      }),
    );

    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("unreadable");
    expect(record.error?.code).toBe("corrupt");
    expect(record.run).toBeNull();
    // The recoverable half: what the player called it, when they saved
    // it, and the face they were wearing.
    expect(record.label).toBe("Night before");
    expect(record.savedAt).toBe(4321);
    expect(record.thumbnails.portrait).toBe(PIXEL_PNG);
  });

  it("keeps the whole summary of a save from another build", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    state.version = GAME_STATE_VERSION + 1;
    saveGame(state, "slot1", storage, 55, { label: "From the future" });

    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("unreadable");
    expect(record.error?.code).toBe("version-mismatch");
    expect(record.label).toBe("From the future");
    expect(record.run?.characterName).toBe("Vex");
    // It was always listed, and it still is — the friendly version
    // error belongs to the attempt to load it.
    expect(listSaves(storage).map((s) => s.slot)).toEqual(["slot1"]);
  });

  it("never throws for a slot holding arbitrary JSON", () => {
    const storage = createMemoryStorage();
    for (const junk of ["[]", "null", "42", '"a string"', "{}"]) {
      storage.setItem("neon-fable:save:slot1", junk);
      expect(() => readSaveSlot("slot1", storage)).not.toThrow();
      expect(readSaveSlot("slot1", storage).status).toBe("unreadable");
    }
  });
});

describe("renaming a save", () => {
  it("names a save without touching the state it holds", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    saveGame(state, "slot1", storage, 1, { thumbnails: thumbs(PIXEL_PNG) });

    expect(renameSave("slot1", storage, "  The long walk  ")).toBe(
      "The long walk",
    );
    const record = readSaveSlot("slot1", storage);
    expect(record.label).toBe("The long walk");
    expect(record.thumbnails.portrait).toBe(PIXEL_PNG);
    expect(loadGame("slot1", storage)).toEqual(state);
  });

  it("clears the label when given nothing", () => {
    const storage = createMemoryStorage();
    saveGame(makeState(), "slot1", storage, 1, { label: "Old name" });
    expect(renameSave("slot1", storage, "   ")).toBe("");
    expect(readSaveSlot("slot1", storage).label).toBe("");
  });

  it("names a save from another build, which is all that can be done with it", () => {
    const storage = createMemoryStorage();
    const state = makeState();
    state.version = GAME_STATE_VERSION + 1;
    saveGame(state, "slot1", storage, 1);
    expect(renameSave("slot1", storage, "Do not delete")).toBe("Do not delete");
    expect(readSaveSlot("slot1", storage).label).toBe("Do not delete");
  });

  it("adds metadata to a save written before metadata existed", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "neon-fable:save:slot1",
      JSON.stringify({ version: 6, savedAt: 777, state: V6_SAVE_STATE }),
    );
    renameSave("slot1", storage, "Sable's run");
    expect(readSaveSlot("slot1", storage).label).toBe("Sable's run");
    // And the save still migrates and loads exactly as before.
    expect(loadGame("slot1", storage).player.name).toBe("Sable");
  });

  it("refuses an empty slot and unparseable JSON", () => {
    const storage = createMemoryStorage();
    expect(() => renameSave("slot1", storage, "x")).toThrow(SaveError);
    storage.setItem("neon-fable:save:slot2", "{not json");
    try {
      renameSave("slot2", storage, "x");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as SaveError).code).toBe("corrupt");
    }
  });
});
