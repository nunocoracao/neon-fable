// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import type { CharacterState } from "../character/create";
import { installEnhancement } from "../inventory/equipment";
import { addItem } from "../inventory/inventory";
import { createNewGame } from "../state";
import { createInventoryOverlay } from "./inventoryOverlay";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";

/**
 * Static where the player actually meets it: the meter on the
 * character screen, and the projection an install button carries
 * before it is pressed. The arithmetic is proven in
 * src/inventory/staticLoad.test.ts and the wording in
 * ./staticModel.test.ts; what is asked here is whether any of it
 * reaches the screen — and whether pressing the button delivers the
 * band the button promised.
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

let session: Session;
let handle: OverlayHandle | undefined;

/** A runner with the capacity to carry enough chrome to scream. */
function chromeCarrier(): CharacterState {
  return fixtureCharacter({
    name: "Vex",
    allocation: { body: 9, reflexes: 4, tech: 4, cool: 9, intelligence: 4 },
  });
}

function install(...itemIds: string[]): void {
  let { player, inventory } = session.state;
  for (const id of itemIds) {
    const loadout = installEnhancement(player, addItem(inventory, id), id);
    player = loadout.character;
    inventory = loadout.inventory;
  }
  session.state = { ...session.state, player, inventory };
}

function carry(...itemIds: string[]): void {
  let inventory = session.state.inventory;
  for (const id of itemIds) inventory = addItem(inventory, id);
  session.state = { ...session.state, inventory };
}

function openInventory(): void {
  handle = createInventoryOverlay({
    session,
    onStateChange: () => {},
    onClose: () => {},
  });
  document.body.append(handle.el);
}

function reopen(): void {
  handle?.destroy();
  handle = undefined;
  document.body.replaceChildren();
  openInventory();
}

function meter(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".nf-static");
  if (!el) throw new Error("no Static section on the character screen");
  return el;
}

/** The card for a carried item, found by its name. */
function card(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".nf-item-card")].find(
    (el) => el.querySelector(".nf-item-name")?.textContent?.includes(name),
  );
  if (!found) throw new Error(`no carried card for "${name}"`);
  return found;
}

function click(within: HTMLElement, text: string): void {
  const button = [...within.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
  if (!button) throw new Error(`no button labelled "${text}"`);
  button.click();
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    anything() as never,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  session = createSession(createNewGame({ character: chromeCarrier() }));
});

afterEach(() => {
  handle?.destroy();
  handle = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Static meter", () => {
  it("reads clear and empty for somebody carrying no chrome", () => {
    openInventory();
    expect(meter().dataset.band).toBe("clear");
    expect(meter().querySelector(".nf-static-label")?.textContent).toBe(
      "Static 0 — Clear",
    );
    expect(
      meter().querySelector<HTMLElement>(".nf-static-fill")?.style.width,
    ).toBe("0%");
    // Nothing is being charged, so nothing is claimed.
    expect(meter().querySelector(".nf-static-band")?.textContent).toBe("");
  });

  it("names the band and what it costs once the chrome is loud", () => {
    install("cyb-myomer-arms", "cyb-lattice-coprocessor");
    openInventory();
    expect(meter().dataset.band).toBe("loud");
    expect(meter().querySelector(".nf-static-label")?.textContent).toBe(
      "Static 6 — Loud",
    );
    const notes = meter().querySelector(".nf-static-band");
    expect(notes?.textContent).toContain("Cool in conversation");
    expect(notes?.textContent).toContain("chrome-affinity");
    expect(notes?.className).toContain("nf-static-loud");
  });

  it("pins the bar and warns about the surge at screaming", () => {
    install("cyb-warden-optics", "cyb-myomer-arms", "cyb-static-veil");
    openInventory();
    expect(meter().dataset.band).toBe("screaming");
    expect(
      meter().querySelector<HTMLElement>(".nf-static-fill")?.style.width,
    ).toBe("100%");
    expect(meter().querySelector(".nf-static-band")?.textContent).toContain(
      "Static surge",
    );
  });
});

describe("the install shelf", () => {
  it("projects the band before anything is committed to", () => {
    install("cyb-warden-optics", "cyb-myomer-arms");
    carry("cyb-static-veil");
    openInventory();
    const veil = card("Static Veil");
    expect(veil.textContent).toContain("+3 Static → 10 · Screaming");
    // The item's own line carries the load too, so the shelf prices
    // both costs before the projection does any arithmetic.
    expect(veil.textContent).toContain("+3 Static");
  });

  it("delivers exactly the band it projected", () => {
    install("cyb-warden-optics", "cyb-myomer-arms");
    carry("cyb-static-veil");
    openInventory();
    expect(meter().dataset.band).toBe("loud");
    click(card("Static Veil"), "Install");
    expect(meter().dataset.band).toBe("screaming");
    expect(meter().querySelector(".nf-static-label")?.textContent).toBe(
      "Static 10 — Screaming",
    );
  });

  it("marks a dampener as the one install that quiets things", () => {
    install("cyb-myomer-arms", "cyb-optic-suite");
    carry("cyb-null-collar");
    openInventory();
    const collar = card("Null Collar");
    const projection = collar.querySelector<HTMLElement>(".nf-static-quiets");
    expect(projection?.textContent).toContain("-3 Static");
    expect(projection?.dataset.band).toBe("clear");

    click(collar, "Install");
    expect(meter().querySelector(".nf-static-label")?.textContent).toBe(
      "Static 2 — Clear",
    );
  });

  it("says what pulling an installed implant would leave behind", () => {
    install("cyb-myomer-arms");
    openInventory();
    expect(document.body.textContent).toContain("Pulling it: -3 Static → 0");
  });
});

describe("the portrait at screaming", () => {
  it("only drives the flicker loop once the band calls for it", () => {
    const frames = vi.fn(() => 0);
    vi.stubGlobal("requestAnimationFrame", frames);

    install("cyb-myomer-arms");
    openInventory();
    expect(meter().dataset.band).toBe("humming");
    expect(frames).not.toHaveBeenCalled();

    install("cyb-warden-optics", "cyb-static-veil");
    reopen();
    expect(meter().dataset.band).toBe("screaming");
    expect(frames).toHaveBeenCalled();
  });
});
