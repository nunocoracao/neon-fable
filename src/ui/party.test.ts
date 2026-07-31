// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { companionSpriteId } from "../data";
import * as iso from "../iso";
import type { IsoSceneOptions } from "../iso";
import {
  activeMember,
  adjustLoyalty,
  createNewGame,
  getMember,
  recruitCompanion,
  setActiveCompanion,
  type GameState,
} from "../state";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The crew panel, driven through the real game screen: who is on it,
 * what switching does to the party and to the map behind it, and the
 * private word a companion has earned. The party rules themselves are
 * proven in src/state/party.test.ts and src/narrative/loyalty.test.ts;
 * what is asked here is whether the buttons reach them.
 */

let sceneOptions: IsoSceneOptions | null = null;
let sceneHandles: iso.IsoScene[] = [];

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
}

function click(text: string): void {
  const button = buttonByText(text);
  if (!button) throw new Error(`no button labelled "${text}"`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function cards(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-party-card")];
}

function cardFor(companionId: string): HTMLElement {
  const card = cards().find((el) => el.dataset.companion === companionId);
  if (!card) throw new Error(`no crew card for "${companionId}"`);
  return card;
}

/** A run with both companions recruited and `active` the one out. */
function crewState(active: string | null, loyalties: Record<string, number> = {}): GameState {
  const state = createNewGame({ character: fixtureCharacter({}), seed: 11 });
  let party = recruitCompanion(recruitCompanion(state.party, "vesper"), "sill");
  for (const [id, loyalty] of Object.entries(loyalties)) {
    party = adjustLoyalty(party, id, loyalty);
  }
  return {
    ...state,
    location: "vertical-market",
    party: setActiveCompanion(party, active),
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  sceneOptions = null;
  sceneHandles = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const realIsoScene = iso.createIsoScene;
  vi.spyOn(iso, "createIsoScene").mockImplementation((canvas, options) => {
    sceneOptions = options;
    const scene = realIsoScene(canvas, options);
    sceneHandles.push(scene);
    return scene;
  });
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the crew panel", () => {
  it("opens on the HUD button and on C, and closes again", () => {
    showScreen(createGameScreen({ session: createSession(crewState("vesper")) }));
    expect(cards()).toHaveLength(0);

    click("Crew [C]");
    expect(cards()).toHaveLength(2);

    pressKey("c");
    expect(cards()).toHaveLength(0);

    pressKey("c");
    expect(cards()).toHaveLength(2);
  });

  it("lists everybody who joined and marks the one who is out", () => {
    showScreen(createGameScreen({ session: createSession(crewState("sill")) }));
    click("Crew [C]");
    expect(cardFor("sill").className).toContain("nf-party-active");
    expect(cardFor("vesper").className).not.toContain("nf-party-active");
    expect(cardFor("sill").textContent).toContain("Deacon Sill");
    expect(cardFor("vesper").textContent).toContain("Vesper Kade");
  });

  it("says where each of them stands, in words", () => {
    showScreen(
      createGameScreen({
        session: createSession(crewState("vesper", { vesper: 5, sill: -4 })),
      }),
    );
    click("Crew [C]");
    expect(cardFor("vesper").textContent).toContain("Loyal");
    expect(cardFor("sill").textContent).toContain("Cold");
  });

  it("switches who is walking with you, and the map follows at once", () => {
    const session = createSession(crewState("vesper"));
    showScreen(createGameScreen({ session }));
    expect(sceneOptions?.followerSpriteId).toBe(
      companionSpriteId("vesper", "quays-runner"),
    );

    const followers: Array<string | null> = [];
    sceneHandles.at(-1)!.setFollower = (id) => void followers.push(id);

    click("Crew [C]");
    cardFor("sill").querySelector("button")!.click();

    expect(activeMember(session.state.party)?.companionId).toBe("sill");
    expect(getMember(session.state.party, "vesper")!.active).toBe(false);
    expect(followers.at(-1)).toBe(companionSpriteId("sill", "struck-off"));
    // The panel stays open on the swap, now marking the other card.
    expect(cardFor("sill").className).toContain("nf-party-active");
  });

  it("sends everybody home when the player wants the job alone", () => {
    const session = createSession(crewState("sill"));
    showScreen(createGameScreen({ session }));
    const followers: Array<string | null> = [];
    sceneHandles.at(-1)!.setFollower = (id) => void followers.push(id);

    click("Crew [C]");
    click("Stand down");

    expect(activeMember(session.state.party)).toBeNull();
    expect(followers.at(-1)).toBeNull();
    // Benched is not dropped: both are still there to take along again.
    expect(session.state.party.members).toHaveLength(2);
    click("Take along");
    expect(activeMember(session.state.party)).not.toBeNull();
  });

  it("tells a player with no crew that they are on their own", () => {
    const solo = createNewGame({ character: fixtureCharacter({}), seed: 4 });
    showScreen(
      createGameScreen({
        session: createSession({ ...solo, location: "vertical-market" }),
      }),
    );
    click("Crew [C]");
    expect(cards()).toHaveLength(0);
    expect(document.querySelector(".nf-party")?.textContent).toContain(
      "Nobody has thrown in with you yet",
    );
  });
});

describe("the private word", () => {
  it("is offered only when somebody has earned it, and to them alone", () => {
    showScreen(createGameScreen({ session: createSession(crewState("vesper")) }));
    click("Crew [C]");
    expect(buttonByText("A word in private")).toBeUndefined();
    pressKey("Escape");

    // Loyal enough, but sitting this one out: still nothing to say.
    showScreen(
      createGameScreen({
        session: createSession(crewState("vesper", { sill: 6 })),
      }),
    );
    click("Crew [C]");
    expect(buttonByText("A word in private")).toBeUndefined();
    pressKey("Escape");

    showScreen(
      createGameScreen({
        session: createSession(crewState("sill", { sill: 6 })),
      }),
    );
    click("Crew [C]");
    expect(buttonByText("A word in private")).toBeDefined();
    expect(cardFor("sill").textContent).toContain("has something to say");
  });

  it("plays the scene through the dialogue box and locks where he stands", () => {
    const session = createSession(crewState("sill", { sill: 6 }));
    showScreen(createGameScreen({ session }));
    click("Crew [C]");
    click("A word in private");

    click("\"Out with it, Sill.\"");
    click("\"What's stopping you?\"");
    click("\"Sign it. All of it.");

    expect(session.state.flags["sill-bond"]).toBe("sworn");
    expect(getMember(session.state.party, "sill")!.loyalty).toBe(9);

    // Asked and answered: the panel stops offering it.
    click("\"Then let's go and oblige them.\"");
    click("Crew [C]");
    expect(buttonByText("A word in private")).toBeUndefined();
  });
});

describe("a choice the crew is watching", () => {
  it("says who approved of it, once, on the beat after", () => {
    // The market's locker, opened by force with the auditor watching:
    // taking a thing is exactly what he cannot stand.
    const state = crewState("sill");
    const session = createSession({
      ...state,
      player: { ...state.player, stats: { ...state.player.stats, body: 9 } },
    });
    showScreen(createGameScreen({ session }));
    sceneOptions!.onInteract({
      interactableId: "market-consignment",
      interaction: { kind: "dialogue", nodeId: "vm-stash" },
    });

    click("Put a shoulder into it");
    expect(document.querySelector(".nf-dialogue-loyalty")?.textContent).toBe(
      "Deacon Sill disapproves",
    );
    expect(getMember(session.state.party, "sill")!.loyalty).toBeLessThan(0);

    // Spent: the note belongs to the beat it was earned on.
    click("Push the door shut");
    expect(document.querySelector(".nf-dialogue-loyalty")).toBeNull();
  });
});
