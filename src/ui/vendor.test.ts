// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { HAGGLE, type VendorId } from "../data/economy";
import { haggleAttempt } from "../economy/haggle";
import { addItem } from "../inventory";
import { createMemoryStorage, createNewGame, type GameState } from "../state";
import { ledgerFor } from "../state/vendors";
import type { OverlayHandle } from "./overlay";
import { createSession, type Session } from "./session";
import { createVendorOverlay } from "./vendorOverlay";
import { itemValue } from "../data/economy";
import { VENDOR_STOCK } from "../data/world";
/**
 * The two figures the risk-premium rows are made of, read off the
 * content rather than written down here — an economy balance pass moves
 * both, and neither is what these tests are about.
 */
const RAIL_WORTH = itemValue("wpn-rail-spitter");
const HOT_PREMIUM =
  VENDOR_STOCK.find((entry) => entry.id === "buy-rail-spitter-hot")?.premium ??
  0;


/**
 * The counter screen, driven in happy-dom. What is proved here is the
 * wiring the model cannot: that the price on the button is the price
 * charged, that the breakdown is reachable (hover and click alike), and
 * that a lost argument shows as a locked counter rather than a button
 * that quietly does nothing.
 */

const STALL: VendorId = "wet-market-back";

function seedWhere(won: boolean, act: number, cool: number): number {
  for (let seed = 1; seed < 5000; seed++) {
    if (haggleAttempt({ vendorId: STALL, act, seed }, cool).won === won) {
      return seed;
    }
  }
  throw new Error("no such seed");
}

function shopper(overrides: Partial<GameState> = {}): GameState {
  const base = createNewGame({
    character: fixtureCharacter({ backgroundId: "tower-analyst" }),
    seed: 1,
  });
  return {
    ...base,
    credits: 1000,
    flags: { ...base.flags, "act1-complete": true },
    ...overrides,
  };
}

let session: Session;
let overlay: OverlayHandle;
let closed: boolean;

function mount(state: GameState, vendorId = STALL): void {
  session = createSession(state, createMemoryStorage());
  closed = false;
  overlay = createVendorOverlay({
    session,
    vendorId,
    onStateChange: () => {},
    onClose: () => {
      closed = true;
    },
  });
  document.body.append(overlay.el);
}

afterEach(() => {
  overlay?.destroy();
  document.body.replaceChildren();
});

function buttons(): HTMLButtonElement[] {
  return [...overlay.el.querySelectorAll("button")];
}

function find(match: string | RegExp, nth = 0): HTMLButtonElement {
  const matches = buttons().filter((b) =>
    typeof match === "string"
      ? b.textContent === match
      : match.test(b.textContent ?? ""),
  );
  const button = matches[nth];
  if (!button) {
    throw new Error(
      `no button ${match} #${nth} — have ${buttons()
        .map((b) => b.textContent)
        .join(" | ")}`,
    );
  }
  return button;
}

/** The card for one shelf line, by the item's name. */
function card(name: string): HTMLElement {
  const found = [...overlay.el.querySelectorAll(".nf-vendor-row")].find((row) =>
    row.querySelector(".nf-item-name")?.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`no row for "${name}"`);
  return found as HTMLElement;
}

describe("the counter screen", () => {
  beforeEach(() => mount(shopper()));

  it("opens on the shelf, named, with the chapter and the counter's kind", () => {
    expect(overlay.el.textContent).toContain("The back shelf");
    expect(overlay.el.textContent).toContain("Street stall");
    expect(overlay.el.textContent).toContain("Act 2 — The Cordon");
    expect(overlay.el.textContent).toContain("1000 cr");
  });

  it("prices every line and says what is left of it", () => {
    const mantle = card("Ghostline Mantle");
    expect(mantle.querySelector(".nf-vendor-figure")?.textContent).toBe("300 cr");
    expect(mantle.textContent).toContain("1 of 1 left this chapter");
  });

  it("charges the price on the button, once", () => {
    find(/^Buy — 300 cr$/).click();
    expect(session.state.credits).toBe(700);
    expect(
      session.state.inventory.stacks.some(
        (stack) => stack.itemId === "out-ghostline-mantle",
      ),
    ).toBe(true);
    // Sold out, and the button says so instead of vanishing.
    expect(card("Ghostline Mantle").textContent).toContain(
      "Sold out this chapter",
    );
    expect(find("Sold out").disabled).toBe(true);
  });

  it("greys what the run cannot afford", () => {
    overlay.destroy();
    mount(shopper({ credits: 10 }));
    expect(find(/^Buy — 300 cr$/).disabled).toBe(true);
  });
});

describe("showing its working", () => {
  it("carries the whole breakdown on hover", () => {
    mount(shopper({ flags: { "act1-complete": true, "kept-spike": true } }));
    const price = card("Rail Spitter").querySelector(".nf-vendor-price");
    expect(price?.getAttribute("title")).toBe(
      `Worth ${RAIL_WORTH} cr · Risk premium +${HOT_PREMIUM} cr · ` +
        `You pay ${RAIL_WORTH + HOT_PREMIUM} cr`,
    );
  });

  it("expands the same lines for anybody who cannot hover", () => {
    mount(shopper({ flags: { "act1-complete": true, "kept-spike": true } }));
    expect(overlay.el.querySelector(".nf-vendor-lines")).toBeNull();
    find("Why?").click();
    const lines = [...overlay.el.querySelectorAll(".nf-vendor-lines li")].map(
      (li) => li.textContent,
    );
    expect(lines).toEqual([`Risk premium+${HOT_PREMIUM} cr`]);
    expect(find("Hide breakdown").getAttribute("aria-expanded")).toBe("true");
  });

  it("offers no breakdown for a price nobody moved", () => {
    mount(shopper());
    const price = card("Ghostline Mantle");
    expect(price.querySelector(".nf-vendor-why")).toBeNull();
    expect(price.querySelector(".nf-vendor-price")?.getAttribute("title")).toBe(
      "Worth 300 cr · You pay 300 cr",
    );
  });
});

describe("the bag", () => {
  it("swaps to what the counter would take, and pays for it", () => {
    const base = shopper();
    mount({
      ...base,
      inventory: addItem(base.inventory, "out-ghostline-mantle"),
    });
    find("In your bag").click();
    const row = card("Ghostline Mantle");
    expect(row.textContent).toContain("Second-hand");
    const before = session.state.credits;
    find(/^Sell — \d+ cr$/).click();
    expect(session.state.credits).toBeGreaterThan(before);
    expect(
      session.state.inventory.stacks.some(
        (stack) => stack.itemId === "out-ghostline-mantle",
      ),
    ).toBe(false);
  });

  it("says so plainly when there is nothing to sell", () => {
    mount(shopper({ inventory: { stacks: [] } }));
    find("In your bag").click();
    expect(overlay.el.textContent).toContain(
      "You are carrying nothing this counter would take",
    );
  });
});

describe("the argument", () => {
  it("quotes the odds, then moves every price when it lands", () => {
    const cool = 7; // tower-analyst, spire suit
    mount(shopper({ rng: { seed: seedWhere(true, 2, cool) } }));
    expect(find(/^Haggle \(\d+%\)$/)).toBeDefined();
    find(/^Haggle/).click();
    expect(overlay.el.textContent).toContain("takes it off the price");
    expect(ledgerFor(session.state.vendors, STALL, 2).haggle).toBe("won");
    expect(find(/^Buy — 270 cr$/)).toBeDefined();
    // Spent: the button is dead and says why.
    expect(find("Price argued down").disabled).toBe(true);
  });

  it("locks the counter, visibly, when it fails", () => {
    const cool = 7;
    mount(shopper({ rng: { seed: seedWhere(false, 2, cool) } }));
    find(/^Haggle/).click();
    expect(overlay.el.textContent).toContain("does not blink");
    expect(find("They stopped moving").disabled).toBe(true);
    expect(
      overlay.el.querySelector(".nf-vendor-haggle-locked"),
    ).not.toBeNull();
    // And the shelf is still at list price.
    expect(find(/^Buy — 300 cr$/)).toBeDefined();
  });

  it("will not be re-rolled by clicking again", () => {
    const cool = 7;
    mount(shopper({ rng: { seed: seedWhere(false, 2, cool) } }));
    find(/^Haggle/).click();
    const after = session.state;
    find("They stopped moving").click();
    expect(session.state).toBe(after);
  });

  it("tells a face too cold what it would take", () => {
    mount(
      shopper({
        player: fixtureCharacter({
          backgroundId: "grid-diver",
          allocation: { body: 8, reflexes: 8, tech: 5, cool: 3, intelligence: 6 },
        }),
      }),
    );
    expect(find("Haggle").disabled).toBe(true);
    expect(overlay.el.textContent).toContain(`Cool ${HAGGLE.minCool}`);
  });
});

describe("closing", () => {
  it("closes on Esc without touching the run", () => {
    mount(shopper());
    const before = session.state;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closed).toBe(true);
    expect(session.state).toBe(before);
  });

  it("closes on the header button", () => {
    mount(shopper());
    find("Done [Esc]").click();
    expect(closed).toBe(true);
  });
});
