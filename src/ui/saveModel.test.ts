import { describe, expect, it } from "vitest";
import { noAssists } from "../data/assists";
import {
  createMemoryStorage,
  createNewGame,
  readSaveSlots,
  saveGame,
  setFlag,
  type SaveStorage,
  type SlotRecord,
} from "../state";
import {
  TYPED_CONFIRM_FROM_ACT,
  cardTitle,
  deleteConfirmed,
  renameError,
  slotCard,
  slotCards,
  type SlotCard,
} from "./saveModel";

/**
 * The save screen's model. Everything here is a pure function over slot
 * records, so the fixtures are records: the real ones a storage round
 * trip produces, and the broken ones a screen has to survive.
 */

const PIXEL_PNG = "data:image/png;base64,iVBORw0KGgo=";

function record(slot: SlotRecord["slot"], patch: Partial<SlotRecord> = {}): SlotRecord {
  return {
    slot,
    status: "empty",
    savedAt: 0,
    label: "",
    thumbnails: { portrait: null, scene: null },
    run: null,
    error: null,
    hasBackup: false,
    ...patch,
  };
}

function storageWith(
  configure: (storage: SaveStorage) => void = () => {},
): SaveStorage {
  const storage = createMemoryStorage();
  configure(storage);
  return storage;
}

function cardsFrom(storage: SaveStorage, mode: "game" | "menu" = "game"): SlotCard[] {
  return slotCards(readSaveSlots(storage), mode);
}

function bySlot(cards: SlotCard[], slot: string): SlotCard {
  const found = cards.find((card) => card.slot === slot);
  if (!found) throw new Error(`no card for ${slot}`);
  return found;
}

describe("slot cards", () => {
  it("draws a card for every slot, occupied or not", () => {
    const cards = cardsFrom(storageWith());
    expect(cards.map((card) => card.slot)).toEqual([
      "slot1",
      "slot2",
      "slot3",
      "autosave",
    ]);
    for (const card of cards) {
      expect(card.status).toBe("empty");
      expect(cardTitle(card)).toBe(card.slotName);
      expect(card.canLoad).toBe(false);
      expect(card.canDelete).toBe(false);
      expect(card.portrait).toBeNull();
    }
  });

  it("says who the runner is, where they are, and what they are playing", () => {
    const storage = storageWith((store) => {
      const state = createNewGame({ playerName: "Vex", seed: 3 });
      state.location = "greywater-steps";
      state.lore = { collected: ["shard-a"] };
      state.rules = {
        difficulty: "blackout",
        assists: noAssists(),
        difficultyChanged: false,
      };
      setFlag(state, "act1-complete", true);
      setFlag(state, "combat:enc-underpass", "victory");
      saveGame(state, "slot1", store, 1_700_000_000_000, {
        thumbnails: { portrait: PIXEL_PNG, scene: PIXEL_PNG },
      });
    });

    const card = bySlot(cardsFrom(storage), "slot1");
    expect(card.status).toBe("ready");
    expect(card.identity).toBe("Vex — Gutter Courier");
    expect(card.chapter).toBe("Act 2 · The Cordon — Greywater Steps");
    expect(card.progress).toBe("1 shard · 1 fight won");
    expect(card.difficultyLabel).toBe("Blackout");
    expect(card.savedAtLabel).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(card.portrait).toBe(PIXEL_PNG);
    expect(card.scene).toBe(PIXEL_PNG);
    expect(card.notice).toBeNull();
  });

  it("pluralizes the progress line and flags a preset moved mid-run", () => {
    const card = slotCard(
      record("slot1", {
        status: "ready",
        savedAt: 5,
        run: {
          characterName: "Vex",
          backgroundId: "grid-diver",
          location: "cinder-plaza",
          act: 1,
          difficulty: "drift",
          difficultyChanged: true,
          newGamePlus: false,
          shardsFound: 0,
          victories: 3,
        },
      }),
      "game",
    );
    expect(card.progress).toBe("0 shards · 3 fights won");
    expect(card.difficultyLabel).toBe("Drift (changed mid-run)");
  });

  it("badges a New Game+ run", () => {
    const storage = storageWith((store) => {
      const state = createNewGame({ playerName: "Wick", seed: 1 });
      setFlag(state, "ng-plus", true);
      saveGame(state, "slot2", store, 10);
    });
    expect(bySlot(cardsFrom(storage), "slot2").badges).toEqual(["NG+"]);
    expect(bySlot(cardsFrom(storage), "slot1").badges).toEqual([]);
  });

  it("titles a card with the player's label and keeps the slot name beside it", () => {
    const card = slotCard(
      record("slot3", { status: "ready", label: "Before the Undercroft" }),
      "game",
    );
    expect(cardTitle(card)).toBe("Before the Undercroft");
    expect(card.slotName).toBe("Slot 3");
  });

  it("offers Save on the manual slots in a run, and never on autosave", () => {
    const inGame = cardsFrom(storageWith(), "game");
    expect(inGame.map((card) => card.canSave)).toEqual([true, true, true, false]);
    const fromMenu = cardsFrom(storageWith(), "menu");
    expect(fromMenu.every((card) => !card.canSave)).toBe(true);
  });
});

describe("slots that will not read", () => {
  it("shows a corrupt slot as an info card instead of dropping it", () => {
    const storage = storageWith((store) => {
      store.setItem("neon-fable:save:slot1", "{not json");
    });
    const card = bySlot(cardsFrom(storage), "slot1");
    expect(card.status).toBe("unreadable");
    expect(card.notice).toMatch(/could not be read/);
    expect(card.canLoad).toBe(false);
    // Still deletable — an unusable slot the player cannot clear is
    // worse than the corruption.
    expect(card.canDelete).toBe(true);
    expect(card.canRename).toBe(false);
    expect(card.identity).toBe("");
  });

  it("keeps a broken slot's own metadata on the card", () => {
    const card = slotCard(
      record("slot2", {
        status: "unreadable",
        savedAt: 1_700_000_000_000,
        label: "Night before",
        thumbnails: { portrait: PIXEL_PNG, scene: null },
        error: { code: "corrupt", message: "malformed", detail: "" },
      }),
      "game",
    );
    expect(cardTitle(card)).toBe("Night before");
    expect(card.portrait).toBe(PIXEL_PNG);
    expect(card.savedAtLabel).not.toBe("");
  });

  it("explains a save from another build and still lets it be named", () => {
    const storage = storageWith((store) => {
      const state = createNewGame({ playerName: "Vex", seed: 2 });
      state.version = 9999;
      saveGame(state, "slot1", store, 20);
    });
    const card = bySlot(cardsFrom(storage), "slot1");
    expect(card.status).toBe("unreadable");
    expect(card.notice).toMatch(/different version/);
    expect(card.canLoad).toBe(false);
    expect(card.canRename).toBe(true);
    // The state parsed, so everything the card says about the run is
    // still there to say.
    expect(card.identity).toBe("Vex — Gutter Courier");
  });
});

describe("saves with no pictures", () => {
  it("leaves both thumbnails null so the screen draws its placeholder", () => {
    const storage = storageWith((store) => {
      // A v6 save, written before slot metadata existed at all: every
      // field that version had, and not one more.
      store.setItem(
        "neon-fable:save:slot1",
        JSON.stringify({
          version: 6,
          savedAt: 777,
          state: {
            version: 6,
            player: {
              name: "Sable",
              backgroundId: "grid-diver",
              stats: {},
              equipment: {},
            },
            flags: {},
            location: "cinder-plaza",
            inventory: { stacks: [] },
            credits: 25,
            pendingEncounterId: null,
            rng: { seed: 7 },
          },
        }),
      );
    });
    const card = bySlot(cardsFrom(storage), "slot1");
    expect(card.portrait).toBeNull();
    expect(card.scene).toBeNull();
    // And loses nothing else: it still reads, loads, and renames.
    expect(card.status).toBe("ready");
    expect(card.identity).toBe("Sable — Grid Diver");
    expect(card.chapter).toBe("Act 1 · The Undertow — Cinder Row Plaza");
    expect(card.canLoad).toBe(true);
    expect(card.canRename).toBe(true);
  });

  it("names an unnamed runner rather than showing an empty line", () => {
    const card = slotCard(
      record("slot1", {
        status: "ready",
        run: {
          characterName: "  ",
          backgroundId: "nope-retired-background",
          location: "map-that-moved",
          act: 1,
          difficulty: "grind",
          difficultyChanged: false,
          newGamePlus: false,
          shardsFound: 0,
          victories: 0,
        },
      }),
      "game",
    );
    expect(card.identity).toBe("Unnamed runner");
    // An id this build no longer has is printed rather than hidden.
    expect(card.chapter).toBe("Act 1 · The Undertow — map-that-moved");
  });
});

describe("the delete guard", () => {
  function cardAtAct(act: number, name = "Vex"): SlotCard {
    return slotCard(
      record("slot1", {
        status: "ready",
        run: {
          characterName: name,
          backgroundId: "gutter-courier",
          location: "cinder-plaza",
          act,
          difficulty: "grind",
          difficultyChanged: false,
          newGamePlus: false,
          shardsFound: 0,
          victories: 0,
        },
      }),
      "game",
    );
  }

  it("takes a click in the first chapter", () => {
    const card = cardAtAct(1);
    expect(card.deleteGuard).toBe("click");
    expect(deleteConfirmed(card, "")).toBe(true);
  });

  it("takes the runner's name from the chapter the guard starts", () => {
    const card = cardAtAct(TYPED_CONFIRM_FROM_ACT);
    expect(card.deleteGuard).toBe("type-name");
    expect(card.confirmWord).toBe("Vex");
    expect(deleteConfirmed(card, "")).toBe(false);
    expect(deleteConfirmed(card, "Wick")).toBe(false);
    expect(deleteConfirmed(card, "  vex ")).toBe(true);
  });

  it("falls back to a click when there is no name to type", () => {
    const card = cardAtAct(3, "   ");
    expect(card.deleteGuard).toBe("click");
    expect(deleteConfirmed(card, "")).toBe(true);
  });

  it("takes a click for a slot too broken to say whose run it was", () => {
    const card = slotCard(
      record("slot1", {
        status: "unreadable",
        error: { code: "corrupt", message: "malformed", detail: "" },
      }),
      "game",
    );
    expect(card.deleteGuard).toBe("click");
  });
});

describe("rename hygiene", () => {
  it("accepts a normal label and an empty one", () => {
    expect(renameError("Before the Undercroft")).toBeNull();
    expect(renameError("")).toBeNull();
  });

  it("rejects a label that sanitizes to nothing", () => {
    expect(renameError("   ")).toMatch(/Enter a name/);
  });

  it("rejects a label past the cap", () => {
    expect(renameError("x".repeat(60))).toMatch(/cap at/);
  });
});
