// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage, createNewGame, type GameState } from "../state";
import { announcedText } from "./announce";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";
import { combatSceneNarration } from "./format";

/**
 * The wiring sweep: the screens that draw on a canvas or rewrite
 * themselves in place actually carry a live region, and it actually
 * says something.
 *
 * This is the check that would have caught the state the game shipped
 * v1 in — every announcement helper present and correct, and not one of
 * them mounted on the two screens where the game happens.
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

function state(): GameState {
  const base = createNewGame({ playerName: "Test", seed: 5 });
  return { ...base, location: "cinder-plaza" };
}

/** Every polite or assertive region currently on the page. */
function regions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("[aria-live]")];
}

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

describe("the street narrates itself", () => {
  it("says where the player has arrived and how much of it they can use", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session }));
    const said = regions().map(announcedText).join(" ");
    expect(said).toContain("Cinder Row");
    expect(said).toMatch(/thing/);
  });

  it("makes the interact prompt announce itself as it changes", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session }));
    const prompt = document.querySelector(".nf-interact-prompt");
    expect(prompt?.getAttribute("aria-live")).toBe("polite");
    expect(prompt?.getAttribute("role")).toBe("status");
  });
});

describe("a conversation announces who is speaking", () => {
  it("says the speaker and the line together", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(
      createGameScreen({ session, dialogueNodeId: "wet-market-back" }),
    );
    const said = regions().map(announcedText).join(" ");
    // The speaker's name and the words, in one sentence, because a
    // line arriving with nobody attached to it is half a scene.
    expect(said).toContain("Post-flood");
    expect(said).toMatch(/:/);
  });

  it("names the box, so a reader knows what it has landed in", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(
      createGameScreen({ session, dialogueNodeId: "wet-market-back" }),
    );
    const box = document.querySelector(".nf-dialogue");
    expect(box?.getAttribute("role")).toBe("group");
    expect(box?.getAttribute("aria-label")).toBe("Conversation");
  });
});

describe("panels say what they are", () => {
  it("gives every centred overlay a role and a name", () => {
    const session = createSession(state(), createMemoryStorage());
    showScreen(createGameScreen({ session }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "i" }));
    const panel = document.querySelector(".nf-overlay-center");
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.getAttribute("aria-label")?.length).toBeGreaterThan(0);
  });
});

describe("the arena narrates the events the log leaves out", () => {
  const nameOf = (id: string): string =>
    id === "player" ? "Kaz" : "Cordon Enforcer";

  it("says whose turn it is — which the log never does", () => {
    expect(
      combatSceneNarration(
        { type: "turn-started", combatantId: "player" },
        nameOf,
      ),
    ).toBe("Kaz's turn.");
  });

  it("says where a body moved to", () => {
    expect(
      combatSceneNarration(
        {
          type: "moved",
          combatantId: "enemy",
          from: { x: 1, y: 1 },
          to: { x: 2, y: 3 },
        },
        nameOf,
      ),
    ).toBe("Cordon Enforcer moves to column 2, row 3.");
  });

  it("leaves anything the log already says to the log", () => {
    expect(
      combatSceneNarration(
        {
          type: "attacked",
          attackerId: "player",
          targetId: "enemy",
          hit: true,
          damage: 4,
          crit: false,
        },
        nameOf,
      ),
    ).toBeNull();
    expect(
      combatSceneNarration({ type: "round-started", round: 2 }, nameOf),
    ).toBeNull();
  });
});
