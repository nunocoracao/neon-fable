// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VENDOR_IDS, getVendor } from "../data/economy";
import { findArcByNode, storyArcs } from "../data/story";
import { applyChoice, requireNode } from "../narrative";
import {
  createMemoryStorage,
  createNewGame,
  loadGame,
  saveGame,
  type GameState,
} from "../state";
import { ledgerFor } from "../state/vendors";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createMainMenuScreen } from "./mainMenu";
import { createSession } from "./session";

/**
 * The counter as the player reaches it: an `open-vendor` choice in a
 * scene opens the real trade screen through the game screen, closing it
 * comes back to the same beat, and what was bought survives the save.
 *
 * The other thing pinned here is the door count. Buying and selling
 * happen at a counter and nowhere else, and that rule is enforced by
 * there being no other way in — every `open-vendor` effect in the game
 * names a registered vendor, and every registered vendor has a door.
 */

/** A value whose every property/call yields another such value. */
function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  root = document.getElementById("ui-root")!;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(root);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function state(): GameState {
  const base = createNewGame({ playerName: "Test", seed: 5 });
  return {
    ...base,
    location: "cinder-plaza",
    credits: 600,
    flags: { ...base.flags, "act1-complete": true },
  };
}

function button(text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!found) {
    throw new Error(
      `no button "${text}" — have ${[
        ...root.querySelectorAll("button"),
      ]
        .map((b) => b.textContent)
        .join(" | ")}`,
    );
  }
  return found;
}

describe("the doors", () => {
  const doors = storyArcs.flatMap((arc) =>
    arc.nodes.flatMap((node) =>
      node.choices.flatMap((choice) =>
        (choice.effects ?? []).flatMap((effect) =>
          effect.type === "open-vendor"
            ? [{ arc: arc.id, node: node.id, choice: choice.id, vendorId: effect.vendorId }]
            : [],
        ),
      ),
    ),
  );

  it("only ever opens a counter that exists", () => {
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      expect(getVendor(door.vendorId), door.choice).toBeDefined();
    }
  });

  it("gives every registered counter exactly one door", () => {
    for (const vendorId of VENDOR_IDS) {
      const found = doors.filter((door) => door.vendorId === vendorId);
      expect(found.map((door) => door.choice), vendorId).toHaveLength(1);
    }
  });

  it("reports the handoff, and comes back to the same beat", () => {
    const arc = findArcByNode("wet-market-back")!;
    const outcome = applyChoice(
      state(),
      requireNode(arc, "wet-market-back"),
      "trade",
    );
    expect(outcome.vendorId).toBe("wet-market-back");
    expect(outcome.nextNodeId).toBe("wet-market-back");
  });
});

describe("the counter beat", () => {
  it("opens the real trade screen from the game screen and comes back", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(
      createGameScreen({ session, dialogueNodeId: "wet-market-back" }),
    );
    expect(root.querySelector(".nf-dialogue")?.textContent).toContain(
      "Post-flood",
    );

    button("Trade across the oilcloth.").click();
    const counter = root.querySelector(".nf-vendor");
    expect(counter).not.toBeNull();
    expect(counter?.textContent).toContain("The back shelf");

    button("Buy — 300 cr").click();
    expect(session.state.credits).toBe(300);
    expect(ledgerFor(session.state.vendors, "wet-market-back", 2).sold).toEqual({
      "buy-ghostline-mantle": 1,
    });

    button("Done [Esc]").click();
    expect(root.querySelector(".nf-vendor")).toBeNull();
    expect(root.querySelector(".nf-dialogue")?.textContent).toContain(
      "Post-flood",
    );
  });

  it("keeps the purchase, and the counter's book, through a save", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(
      createGameScreen({ session, dialogueNodeId: "wet-market-back" }),
    );
    button("Trade across the oilcloth.").click();
    button("Buy — 300 cr").click();

    saveGame(session.state, "slot1", session.storage, 1);
    const reloaded = loadGame("slot1", session.storage);
    expect(
      reloaded.inventory.stacks.some(
        (stack) => stack.itemId === "out-ghostline-mantle",
      ),
    ).toBe(true);
    // The shelf stays sold out on the other side of the load — a
    // restock is an act away, not a reload away.
    expect(
      ledgerFor(reloaded.vendors, "wet-market-back", 2).sold[
        "buy-ghostline-mantle"
      ],
    ).toBe(1);
  });
});

describe("backing out with the keyboard", () => {
  /**
   * Escape used to reach the game screen's own overlay teardown, which
   * knows nothing about what a panel owes on the way out — so a chair
   * or a counter opened out of a conversation closed onto a dead map
   * with the scene never resumed. Escape now leaves by the same door
   * the panel's own Done button does.
   */
  it("Escape closes the counter back into the conversation", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(
      createGameScreen({ session, dialogueNodeId: "wet-market-back" }),
    );
    button("Trade across the oilcloth.").click();
    expect(root.querySelector(".nf-vendor")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(root.querySelector(".nf-vendor")).toBeNull();
    expect(root.querySelector(".nf-dialogue")?.textContent).toContain(
      "Post-flood",
    );
  });

  it("Escape closes the stylist's chair back into the conversation", () => {
    // The chair has no Escape handler of its own — it is the game
    // screen's, and before the pass that meant standing up out of the
    // chair with Vesper's scene abandoned mid-sentence.
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session, dialogueNodeId: "chapel-door" }));
    button("Take the chair. \"Change my look.\" (40 cr)").click();
    expect(root.querySelector(".nf-stylist")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(root.querySelector(".nf-stylist")).toBeNull();
    expect(root.querySelector(".nf-dialogue")).not.toBeNull();
  });
});
