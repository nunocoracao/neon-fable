// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { LORE_SHARDS, requireShard } from "../data";
import * as iso from "../iso";
import type { IsoSceneOptions } from "../iso";
import {
  createNewGame,
  loadMetaProgress,
  recordShardToStorage,
  type GameState,
} from "../state";
import { createCodexScreen } from "./codexScreen";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession, type Session } from "./session";

/**
 * Picking the city's history up off the floor, through the real screens.
 *
 * The engine's own tests prove the placement and the gates; this one
 * drives the map the player actually walks on — the chip is on it, the
 * prompt picks it up, the toast says so, the run and the meta record
 * both move, the chip is gone the next time you walk in, and the codex
 * reads it back.
 */

/** Options the exploration scene was last built with. */
let sceneOptions: IsoSceneOptions | null = null;

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function toastText(): string {
  return document.querySelector(".nf-toast")?.textContent ?? "";
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

function click(label: string): void {
  const button = buttons().find((b) => (b.textContent ?? "").includes(label));
  if (!button) throw new Error(`no button labelled "${label}"`);
  button.click();
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    ...createNewGame({ character: fixtureCharacter({}), seed: 11 }),
    location: "cinder-plaza",
    ...overrides,
  };
}

/** Mounts the game screen on a run and hands back its session. */
function play(overrides: Partial<GameState> = {}): Session {
  const session = createSession(state(overrides), localStorage);
  showScreen(createGameScreen({ session }));
  return session;
}

/** Walks up to a chip and takes it, the way the scene reports it. */
function pickUp(shardId: string): void {
  sceneOptions?.onInteract({
    interactableId: shardId,
    interaction: { kind: "lore", shardId },
  });
}

function shardIdsOnScene(): string[] {
  return (sceneOptions?.map.interactables ?? [])
    .filter((thing) => thing.spriteId === "shard")
    .map((thing) => thing.id);
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  sceneOptions = null;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const realIsoScene = iso.createIsoScene;
  vi.spyOn(iso, "createIsoScene").mockImplementation((canvas, options) => {
    sceneOptions = options;
    return realIsoScene(canvas, options);
  });
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("finding a shard on the street", () => {
  it("lies on the district as a shard-sprited pickup nobody has taken", () => {
    play();
    expect(shardIdsOnScene()).toEqual([
      "shard-tide-tables",
      "shard-founders-keys",
    ]);
    const chip = sceneOptions?.map.interactables.find(
      (thing) => thing.id === "shard-tide-tables",
    );
    expect(chip?.interaction).toEqual({
      kind: "lore",
      shardId: "shard-tide-tables",
    });
    // Not signposted: a collectible you have to actually spot.
    expect(chip?.minimap).toBe(false);
  });

  it("toasts the find, files it in the run, and mirrors it into the codex", () => {
    const session = play();
    pickUp("shard-tide-tables");

    expect(toastText()).toContain("Memory shard recovered");
    expect(toastText()).toContain("Tide Tables, Final Revision");
    expect(toastText()).toContain(`1/${LORE_SHARDS.length}`);
    expect(session.state.lore.collected).toEqual(["shard-tide-tables"]);
    expect(loadMetaProgress(localStorage).shardsSeen).toEqual([
      "shard-tide-tables",
    ]);
    // Mid-run, and without claiming a finished playthrough.
    expect(loadMetaProgress(localStorage).completions).toBe(0);
  });

  it("is gone the next time the player walks in", () => {
    const session = play();
    pickUp("shard-tide-tables");
    showScreen(createGameScreen({ session }));
    expect(shardIdsOnScene()).toEqual(["shard-founders-keys"]);
  });

  it("says so rather than double-counting a chip already in hand", () => {
    const session = play();
    pickUp("shard-tide-tables");
    pickUp("shard-tide-tables");
    expect(toastText()).toContain("already in the codex");
    expect(session.state.lore.collected).toEqual(["shard-tide-tables"]);
  });

  it("calls the twelfth what it is", () => {
    const session = play({
      lore: {
        collected: LORE_SHARDS.filter((s) => s.id !== "shard-tide-tables").map(
          (s) => s.id,
        ),
      },
    });
    pickUp("shard-tide-tables");
    expect(toastText()).toContain(`${LORE_SHARDS.length}/${LORE_SHARDS.length}`);
    expect(toastText()).toContain("Grey Choir");
    expect(session.state.lore.collected).toHaveLength(LORE_SHARDS.length);
  });
});

describe("a sealed shard", () => {
  it("refuses with the line that names what would open it, and stays put", () => {
    const session = play({ location: "auric-executive" });
    expect(shardIdsOnScene()).toEqual(["shard-charter-minutes"]);
    pickUp("shard-charter-minutes");
    expect(toastText()).toBe(requireShard("shard-charter-minutes").sealed);
    expect(session.state.lore.collected).toEqual([]);
    expect(loadMetaProgress(localStorage).shardsSeen).toEqual([]);
    // Still lying there for a character who comes back wired for it.
    showScreen(createGameScreen({ session }));
    expect(shardIdsOnScene()).toEqual(["shard-charter-minutes"]);
  });

  it("opens for a character who meets the gate", () => {
    const base = state({ location: "auric-executive" });
    const session = play({
      location: "auric-executive",
      player: {
        ...base.player,
        equipment: {
          ...base.player.equipment,
          enhancements: {
            ...base.player.equipment.enhancements,
            eyes: "cyb-optic-suite",
          },
        },
      },
    });
    pickUp("shard-charter-minutes");
    expect(toastText()).toContain("Memory shard recovered");
    expect(session.state.lore.collected).toEqual(["shard-charter-minutes"]);
  });
});

const LORE = ".nf-codex-lore";

function loreCards(): Element[] {
  return [...document.querySelectorAll(`${LORE} .nf-codex-entry`)];
}

describe("the codex's shard section", () => {
  it("locks every slot to a number and a district before anything is found", () => {
    showScreen(createCodexScreen({ onBack: () => {} }));
    const cards = loreCards();
    expect(cards).toHaveLength(LORE_SHARDS.length);
    expect(cards.every((c) => c.classList.contains("nf-codex-locked"))).toBe(true);
    expect(cards[0]?.textContent).toContain("Shard 01");
    expect(cards[0]?.textContent).toContain("Cinder Row Plaza");
    // No title and no prose leaks out of a slot nobody has opened.
    expect(document.querySelector(LORE)?.textContent).not.toContain(
      "Tide Tables",
    );
    expect(document.querySelector(LORE)?.textContent).not.toContain(
      "MERIDIAN WATERWORKS",
    );
    expect(document.querySelector(".nf-codex-lore-stats")?.textContent).toContain(
      `Shards ever found 0/${LORE_SHARDS.length}`,
    );
  });

  it("reads a collected shard in full, and counts this run beside ever", () => {
    recordShardToStorage("shard-roll-call", localStorage);
    showScreen(
      createCodexScreen({
        onBack: () => {},
        state: state({ lore: { collected: ["shard-tide-tables"] } }),
      }),
    );
    const found = loreCards().filter((c) =>
      c.classList.contains("nf-codex-found"),
    );
    expect(found).toHaveLength(2);
    expect(document.querySelector(LORE)?.textContent).toContain(
      "MERIDIAN WATERWORKS",
    );
    expect(document.querySelector(LORE)?.textContent).toContain(
      "Roll Call, Ledge Nine",
    );
    // Held right now vs read on some earlier run.
    expect(
      loreCards()
        .filter((c) => c.classList.contains("nf-codex-held"))
        .map((c) => c.querySelector(".nf-codex-title")?.textContent),
    ).toEqual(["01 · Tide Tables, Final Revision"]);
    expect(document.querySelector(".nf-codex-lore-stats")?.textContent).toBe(
      `Shards this run 1/${LORE_SHARDS.length} · Ever found 2/${LORE_SHARDS.length}`,
    );
  });

  it("pays the whole set off, and only the whole set", () => {
    for (const shard of LORE_SHARDS.slice(0, -1)) {
      recordShardToStorage(shard.id, localStorage);
    }
    showScreen(createCodexScreen({ onBack: () => {} }));
    expect(document.querySelector(".nf-codex-payoff")).toBeNull();

    recordShardToStorage(LORE_SHARDS[LORE_SHARDS.length - 1]!.id, localStorage);
    showScreen(createCodexScreen({ onBack: () => {} }));
    const payoff = document.querySelector(".nf-codex-payoff");
    expect(payoff?.textContent).toContain("The Grey Choir");
    expect(payoff?.textContent).toContain("Relay Crown");
  });

  it("is reachable from the pause menu, carrying the run", () => {
    play({ lore: { collected: ["shard-tide-tables"] } });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    click("Codex");
    expect(document.querySelector(".nf-codex-lore-stats")?.textContent).toContain(
      `Shards this run 1/${LORE_SHARDS.length}`,
    );
    click("Back");
    // And back onto the street the run left off on.
    expect(sceneOptions?.map.id).toBe("cinder-plaza");
  });
});
