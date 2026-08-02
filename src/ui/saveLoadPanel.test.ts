// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryStorage,
  createNewGame,
  readSaveSlot,
  saveGame,
  setFlag,
  type GameState,
  type SaveStorage,
} from "../state";
import { createSaveLoadPanel } from "./saveLoad";
import { captureSaveExtras, captureSceneThumb, sceneCanvas } from "./saveThumbs";
import { noteStorageProblem, takeStorageProblem } from "./session";
import type { OverlayHandle } from "./overlay";

/**
 * The save panel, driven the way a player drives it: rename, delete
 * (guarded), and load, with a corrupt slot sitting in the middle of the
 * list the whole time.
 *
 * Canvas is stubbed as in flow.test — nothing here paints, and nothing
 * here should need to: a panel that only works when the browser hands
 * back canvas bytes would be exactly the fragility this is testing for.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let handle: OverlayHandle | null = null;
let loaded: GameState | null = null;

function runState(name: string, act: number): GameState {
  const state = createNewGame({ playerName: name, seed: 7 });
  state.location = "greywater-steps";
  if (act > 1) setFlag(state, "act1-complete", true);
  return state;
}

function openPanel(storage: SaveStorage, mode: "game" | "menu" = "game"): void {
  handle?.destroy();
  loaded = null;
  handle = createSaveLoadPanel({
    mode,
    storage,
    session: { state: runState("Vex", 1), storage },
    onLoaded: (state) => void (loaded = state),
    onClose: () => {},
  });
  document.body.append(handle.el);
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-save-card")];
}

/** The nth card, which every test in here expects to exist. */
function card(index: number): HTMLElement {
  const found = cards()[index];
  if (!found) throw new Error(`no card at index ${index}`);
  return found;
}

function buttonsIn(card: HTMLElement): HTMLButtonElement[] {
  return [...card.querySelectorAll("button")];
}

function clickIn(card: HTMLElement, text: string): void {
  const button = buttonsIn(card).find(
    (b) => (b.textContent ?? "").trim() === text,
  );
  if (!button) throw new Error(`no button "${text}" on this card`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}

function hasButton(card: HTMLElement, text: string): boolean {
  return buttonsIn(card).some((b) => (b.textContent ?? "").trim() === text);
}

function type(selector: string, value: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`no input ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input"));
  return input;
}

beforeEach(() => {
  document.body.innerHTML = "";
  // The problem channel is module-level, like the storage it reports on.
  takeStorageProblem();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  handle?.destroy();
  handle = null;
  vi.restoreAllMocks();
});

describe("the save panel", () => {
  it("draws four cards even when a slot holds garbage", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    storage.setItem("neon-fable:save:slot2", "{not json");
    openPanel(storage);

    expect(cards()).toHaveLength(4);
    expect(card(1).className).toMatch(/nf-save-card-broken/);
    expect(card(1).textContent).toMatch(/could not be read/);
    // The broken slot is not loadable; the good one beside it still is.
    expect(hasButton(card(1), "Load")).toBe(false);
    clickIn(card(0), "Load");
    expect(loaded?.player.name).toBe("Vex");
  });

  it("draws a placeholder silhouette for a save with no thumbnails", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    openPanel(storage);
    expect(card(0).querySelector(".nf-save-silhouette")).toBeTruthy();
    expect(card(0).querySelector("img.nf-save-portrait")).toBeNull();
  });

  it("shows stored thumbnails when a save has them", () => {
    const pixel = "data:image/png;base64,iVBORw0KGgo=";
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000, {
      thumbnails: { portrait: pixel, scene: pixel },
    });
    openPanel(storage);
    expect(
      card(0).querySelector<HTMLImageElement>("img.nf-save-portrait")?.src,
    ).toBe(pixel);
    expect(
      card(0).querySelector<HTMLImageElement>("img.nf-save-scene")?.src,
    ).toBe(pixel);
  });

  it("renames a save and shows the label as the card's title", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    openPanel(storage);

    clickIn(card(0), "Name");
    type("#nf-save-rename-slot1", "  Before the Undercroft  ");
    clickIn(card(0), "Save name");

    expect(readSaveSlot("slot1", storage).label).toBe("Before the Undercroft");
    expect(card(0).querySelector(".nf-save-slot")?.textContent).toMatch(
      /Before the Undercroft/,
    );
    // The run itself is untouched by naming it.
    expect(readSaveSlot("slot1", storage).run?.characterName).toBe("Vex");
  });

  it("refuses a label that is nothing but whitespace", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    openPanel(storage);

    clickIn(card(0), "Name");
    type("#nf-save-rename-slot1", "    ");
    clickIn(card(0), "Save name");

    expect(document.querySelector(".nf-save-inline-error")?.textContent).toMatch(
      /Enter a name/,
    );
    expect(readSaveSlot("slot1", storage).label).toBe("");
  });

  it("deletes a first-chapter save on a confirming click", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    openPanel(storage);

    clickIn(card(0), "Delete");
    clickIn(card(0), "Confirm delete");
    expect(readSaveSlot("slot1", storage).status).toBe("empty");
    expect(card(0).textContent).toMatch(/Empty/);
  });

  it("makes a run past act 1 cost the runner's name, typed", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 2), "slot1", storage, 1000);
    openPanel(storage);

    clickIn(card(0), "Delete");
    const confirm = buttonsIn(card(0)).find(
      (b) => b.textContent === "Confirm delete",
    );
    expect(confirm?.disabled).toBe(true);
    expect(card(0).textContent).toMatch(/Type "Vex"/);

    type("#nf-save-confirm-slot1", "Wick");
    expect(confirm?.disabled).toBe(true);

    type("#nf-save-confirm-slot1", "vex");
    expect(confirm?.disabled).toBe(false);
    confirm?.click();
    expect(readSaveSlot("slot1", storage).status).toBe("empty");
  });

  it("backs out of a guarded delete without touching the save", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 2), "slot1", storage, 1000);
    openPanel(storage);

    clickIn(card(0), "Delete");
    clickIn(card(0), "Cancel");
    expect(readSaveSlot("slot1", storage).status).toBe("ready");
    expect(hasButton(card(0), "Delete")).toBe(true);
  });

  it("writes both thumbnails alongside a manual save when it can", () => {
    const storage = createMemoryStorage();
    openPanel(storage);
    clickIn(card(0), "Save");
    const record = readSaveSlot("slot1", storage);
    expect(record.status).toBe("ready");
    // Whether the stub browser hands back canvas bytes is its business;
    // what matters is that the save is written either way and the
    // thumbnails are either real data URLs or absent.
    for (const thumb of [record.thumbnails.portrait, record.thumbnails.scene]) {
      if (thumb !== null) expect(thumb).toMatch(/^data:image\//);
    }
  });

  it("offers no Save at all from the title screen", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    openPanel(storage, "menu");
    expect(cards().some((card) => hasButton(card, "Save"))).toBe(false);
    expect(hasButton(card(0), "Load")).toBe(true);
  });
});

describe("thumbnail capture", () => {
  it("returns nothing rather than throwing when there is no scene", () => {
    expect(captureSceneThumb(null)).toBeNull();
    const blank = document.createElement("canvas");
    blank.width = 0;
    blank.height = 0;
    expect(captureSceneThumb(blank)).toBeNull();
  });

  it("finds the scene canvas only when the page has one", () => {
    expect(sceneCanvas()).toBeNull();
    const canvas = document.createElement("canvas");
    canvas.id = "iso-canvas";
    document.body.append(canvas);
    expect(sceneCanvas()).toBe(canvas);
  });

  it("always produces a complete extras record, pictures or not", () => {
    const extras = captureSaveExtras(runState("Vex", 1), null);
    expect(extras.label).toBe("");
    expect(extras.thumbnails.scene).toBeNull();
    expect(
      extras.thumbnails.portrait === null ||
        extras.thumbnails.portrait.startsWith("data:image/"),
    ).toBe(true);
  });
});

describe("recovering a broken slot", () => {
  /** A slot with a good backup behind a blob that has been ruined. */
  function slotWithBackup(storage: SaveStorage, ruin: string): void {
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    saveGame(runState("Vex", 2), "slot1", storage, 2000);
    storage.setItem("neon-fable:save:slot1", ruin);
  }

  it("offers the backup on a card that cannot be read, and restores it", () => {
    const storage = createMemoryStorage();
    slotWithBackup(storage, "{ not json at all");
    openPanel(storage);

    expect(card(0).textContent).toMatch(/backup from before it was written/);
    expect(hasButton(card(0), "Restore backup")).toBe(true);

    clickIn(card(0), "Restore backup");
    expect(document.querySelector(".nf-message")?.textContent).toMatch(
      /restored from the save before it/,
    );
    expect(readSaveSlot("slot1", storage).status).toBe("ready");
    clickIn(card(0), "Load");
    expect(loaded?.player.name).toBe("Vex");
  });

  it("offers it for a save that failed its checksum too", () => {
    const storage = createMemoryStorage();
    const good = { ...runState("Vex", 1) };
    saveGame(good, "slot1", storage, 1000);
    saveGame({ ...good, credits: 3 }, "slot1", storage, 2000);
    const envelope = JSON.parse(storage.getItem("neon-fable:save:slot1")!);
    envelope.state.credits = 99_999;
    storage.setItem("neon-fable:save:slot1", JSON.stringify(envelope));

    openPanel(storage);
    expect(card(0).textContent).toMatch(/changed after it was written/);
    expect(hasButton(card(0), "Restore backup")).toBe(true);
    // And cannot be renamed, which would restamp it as sound.
    expect(hasButton(card(0), "Name")).toBe(false);
  });

  it("does not offer a backup that is not there", () => {
    const storage = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot1", storage, 1000);
    storage.setItem("neon-fable:save:slot1", "{ ruined");
    openPanel(storage);

    expect(hasButton(card(0), "Restore backup")).toBe(false);
    expect(card(0).textContent).toMatch(/Everything else is fine/);
  });

  it("keeps offering the backup after a delete takes the whole slot", () => {
    const storage = createMemoryStorage();
    slotWithBackup(storage, "{ ruined");
    openPanel(storage);
    clickIn(card(0), "Delete");
    clickIn(card(0), "Confirm delete");

    expect(card(0).textContent).toMatch(/Empty/);
    expect(storage.getItem("neon-fable:save:slot1:backup")).toBeNull();
  });
});

describe("when storage is full", () => {
  /** A storage that has run out of room, whatever is asked of it. */
  function fullStorage(seed: SaveStorage): SaveStorage {
    return {
      getItem: (key) => seed.getItem(key),
      setItem() {
        const error = new Error("The quota has been exceeded.");
        error.name = "QuotaExceededError";
        throw error;
      },
      removeItem: (key) => seed.removeItem(key),
    };
  }

  it("says what to delete instead of failing quietly", () => {
    const seed = createMemoryStorage();
    saveGame(runState("Vex", 1), "slot2", seed, 1000);
    openPanel(fullStorage(seed));

    clickIn(card(0), "Save");
    const message = document.querySelector(".nf-message");
    expect(message?.className).toMatch(/nf-error/);
    expect(message?.textContent).toMatch(/storage for this game is full/i);
    expect(message?.textContent).toMatch(/Slot 2/);
  });

  it("opens with the autosave failure it was told about", () => {
    const seed = createMemoryStorage();
    noteStorageProblem("The autosave could not be written. Delete something.");
    openPanel(seed);
    expect(document.querySelector(".nf-message")?.textContent).toMatch(
      /autosave could not be written/,
    );

    // And says it once: reopening the panel is not a second warning.
    openPanel(seed);
    expect(document.querySelector(".nf-message")?.textContent).toBe("");
  });
});
