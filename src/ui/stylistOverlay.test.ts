// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHAPEL_DYE_SHELF,
  COSMETIC_APPEARANCE_TABS,
  IDENTITY_CATEGORIES,
  RESTYLE_PRICE,
  RESTYLE_REFUSAL,
  appearanceCatalogs,
  chapelDyePrice,
} from "../data";
import { addItem } from "../inventory";
import { createMemoryStorage, createNewGame, type GameState } from "../state";
import { createSession, type Session } from "./session";
import { createStylistOverlay } from "./stylistOverlay";
import type { OverlayHandle } from "./overlay";

/**
 * Drives the Chrome Chapel re-style screen in happy-dom with the canvas
 * 2D context stubbed. Pixels are not under test — what is: the screen
 * is the shared picker running on the cosmetic tab config (identity
 * categories absent), Confirm routes through the pure restyle rules
 * (payment gate, deduction), and Cancel is a true no-op on GameState.
 *
 * The colour counter is the deliberate exception and is covered here
 * too: a tin is bought and applied on the click, so Cancel drops the
 * look being tried on without refunding the paint.
 */

/** A value whose every property/call yields another such value — enough to
 * satisfy the canvas 2D API without rendering anything. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let session: Session;
let closed: boolean;
let stateChanges: number;
let overlay: OverlayHandle;

function makeState(credits: number): GameState {
  return { ...createNewGame({ playerName: "Test", seed: 5 }), credits };
}

function mount(state: GameState): void {
  session = createSession(state, createMemoryStorage());
  closed = false;
  stateChanges = 0;
  overlay = createStylistOverlay({
    session,
    onStateChange: () => stateChanges++,
    onClose: () => {
      closed = true;
    },
  });
  document.body.append(overlay.el);
}

function tabButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(".nf-appearance-tab")];
}

function pickThumb(category: string, id: string): void {
  const button = document.querySelector<HTMLButtonElement>(
    `button[data-category="${category}"][data-id="${id}"]`,
  );
  if (!button) throw new Error(`no ${category} option "${id}" rendered`);
  button.click();
}

function dyeButtons(): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(".nf-dye-tin")];
}

function dyeButton(dyeId: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `.nf-dye-tin[data-dye="${dyeId}"]`,
  );
  if (!button) throw new Error(`no dye row for "${dyeId}"`);
  return button;
}

function buttonLabelled(text: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.startsWith(text),
  );
  if (!button) throw new Error(`no button labelled "${text}"`);
  return button;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  document.body.innerHTML = "";
});

afterEach(() => {
  overlay.destroy();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("stylist overlay", () => {
  it("renders the shared picker on the cosmetic tabs only", () => {
    mount(makeState(100));
    expect(tabButtons().map((b) => b.textContent)).toEqual(
      COSMETIC_APPEARANCE_TABS.map((tab) => tab.label),
    );
    // No identity controls anywhere, whichever tab is open.
    for (const tab of tabButtons()) {
      tab.click();
      for (const category of IDENTITY_CATEGORIES) {
        expect(
          document.querySelector(`button[data-category="${category}"]`),
        ).toBeNull();
      }
    }
  });

  it("drives the first cosmetic tab's grids from the catalogs", () => {
    mount(makeState(100));
    const firstTab = COSMETIC_APPEARANCE_TABS[0]!;
    for (const config of firstTab.categories) {
      const buttons = [
        ...document.querySelectorAll<HTMLButtonElement>(
          `button[data-category="${config.category}"]`,
        ),
      ];
      expect(buttons.map((b) => b.dataset.id)).toEqual(
        appearanceCatalogs[config.category].map((option) => option.id),
      );
    }
  });

  it("confirm applies the draft to GameState and deducts the fee", () => {
    mount(makeState(RESTYLE_PRICE + 25));
    pickThumb("hairStyle", "mohawk");
    const confirm = buttonLabelled("Confirm");
    expect(confirm.disabled).toBe(false);
    confirm.click();
    expect(session.state.player.appearance.hairStyle).toBe("mohawk");
    expect(session.state.credits).toBe(25);
    expect(stateChanges).toBe(1);
    expect(closed).toBe(true);
  });

  it("cancel is a true no-op even after edits", () => {
    const state = makeState(RESTYLE_PRICE + 25);
    mount(state);
    pickThumb("hairStyle", "mohawk");
    buttonLabelled("Cancel").click();
    expect(session.state).toBe(state);
    expect(stateChanges).toBe(0);
    expect(closed).toBe(true);
  });

  it("gates confirm until something actually changes", () => {
    mount(makeState(RESTYLE_PRICE * 2));
    const confirm = buttonLabelled("Confirm");
    expect(confirm.disabled).toBe(true);
    pickThumb("hairStyle", "mohawk");
    expect(confirm.disabled).toBe(false);
    // Picking the original style back re-disables it.
    pickThumb("hairStyle", session.state.player.appearance.hairStyle);
    expect(confirm.disabled).toBe(true);
  });

  it("refuses politely when the player cannot pay, touching nothing", () => {
    const state = makeState(RESTYLE_PRICE - 1);
    mount(state);
    pickThumb("hairStyle", "mohawk");
    const confirm = buttonLabelled("Confirm");
    expect(confirm.disabled).toBe(true);
    const status = document.querySelector(".nf-stylist-status");
    expect(status?.textContent).toBe(RESTYLE_REFUSAL);
    confirm.click();
    expect(session.state).toBe(state);
    expect(closed).toBe(false);
  });

  it("shows the whole shelf on the colour counter", () => {
    mount(makeState(500));
    expect(dyeButtons().map((b) => b.dataset.dye)).toEqual(
      CHAPEL_DYE_SHELF.map((entry) => entry.itemId),
    );
    expect(document.querySelector(".nf-dye-target")?.textContent).toContain(
      "Factory colours",
    );
  });

  it("buys a tin and paints the coat on the spot", () => {
    const price = chapelDyePrice("dye-cinder-black") ?? 0;
    mount(makeState(500));
    dyeButton("dye-cinder-black").click();

    expect(session.state.player.equipment.outfitDye).toEqual({
      primary: "darkFabric",
      accent: "hazardAmber",
    });
    expect(session.state.credits).toBe(500 - price);
    // The tin was used up by the application, not left in the bag.
    expect(
      session.state.inventory.stacks.some(
        (stack) => stack.itemId === "dye-cinder-black",
      ),
    ).toBe(false);
    expect(stateChanges).toBe(1);
    // The counter re-reads: the same tin is now the colour being worn.
    expect(dyeButton("dye-cinder-black").disabled).toBe(true);
    expect(document.querySelector(".nf-dye-target")?.textContent).toContain(
      "black cloth · amber trim",
    );
  });

  it("applies a found tin for free", () => {
    const state = makeState(0);
    mount({
      ...state,
      inventory: addItem(state.inventory, "dye-last-mile", 1),
    });
    const button = dyeButton("dye-last-mile");
    expect(button.textContent).toContain("Apply — carried");
    button.click();
    expect(session.state.credits).toBe(0);
    expect(session.state.player.equipment.outfitDye).toEqual({
      primary: "hologramBlue",
      accent: "neonCyan",
    });
  });

  it("greys out what an empty purse cannot buy", () => {
    mount(makeState(0));
    expect(dyeButtons().every((b) => b.disabled)).toBe(true);
    // And clicking a dead row changes nothing.
    const before = session.state;
    dyeButton("dye-cinder-black").click();
    expect(session.state).toBe(before);
  });

  it("strips back to factory colours for free, then hides the option", () => {
    mount(makeState(500));
    dyeButton("dye-cinder-black").click();
    const credits = session.state.credits;
    buttonLabelled("Strip to factory colours").click();
    expect(session.state.player.equipment.outfitDye).toBeUndefined();
    expect(session.state.credits).toBe(credits);
    expect(document.querySelector(".nf-dye-strip")).toBeNull();
  });

  it("keeps a colour that was paid for when the look is cancelled", () => {
    mount(makeState(500));
    dyeButton("dye-cinder-black").click();
    pickThumb("hairStyle", "mohawk");
    buttonLabelled("Cancel").click();
    // The draft look is dropped; the purchase is not.
    expect(session.state.player.appearance.hairStyle).not.toBe("mohawk");
    expect(session.state.player.equipment.outfitDye).toBeDefined();
  });

  it("quotes the data-defined fee on the confirm button and header", () => {
    mount(makeState(100));
    expect(buttonLabelled("Confirm").textContent).toBe(
      `Confirm (${RESTYLE_PRICE} cr)`,
    );
    expect(
      document.querySelector(".nf-panel-header")?.textContent,
    ).toContain(`${RESTYLE_PRICE} cr`);
  });
});
