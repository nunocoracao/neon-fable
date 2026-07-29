// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { createCombat, takeAction } from "../combat";
import { addItem, countItem, equip, installEnhancement } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import {
  findFightSeed,
  replayStep,
  scriptFight,
} from "./combatTestSupport";
import { initScreenRouter, showScreen } from "./screen";
import { createSession, type Session } from "./session";

/**
 * Drives the combat screen in happy-dom: fights are scripted against the
 * engine with a scanned RNG seed (see combatTestSupport), then replayed
 * through the real DOM controls, so every assertion runs on the exact
 * battle the engine produced. Enemy turns run synchronously
 * (enemyDelayMs: 0) and canvas rendering is stubbed out.
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

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return buttons().find((b) => (b.textContent ?? "").trim().startsWith(text));
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

function textOf(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function logText(): string {
  return textOf(".nf-combat-log");
}

/** Courier with the shard knife/slicker starting gear, nothing extra. */
function courierState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 5;
  allocation.tech += 5;
  allocation.intelligence += 5;
  return createNewGame({ character: fixtureCharacter({ allocation }), seed });
}

/** Courier armed for the arena: Stun Baton (grants Stun Strike), Myomer
 * Arms (grants Crush), and trauma patches to heal mid-fight. */
function armedState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 5;
  allocation.reflexes += 5;
  allocation.tech += 5;
  const state = createNewGame({ character: fixtureCharacter({ allocation }), seed });
  let inventory = addItem(state.inventory, "wpn-stun-baton", 1);
  inventory = addItem(inventory, "cyb-myomer-arms", 1);
  inventory = addItem(inventory, "con-trauma-patch", 2);
  let loadout = equip(state.player, inventory, "wpn-stun-baton");
  loadout = installEnhancement(
    loadout.character,
    loadout.inventory,
    "cyb-myomer-arms",
  );
  return { ...state, player: loadout.character, inventory: loadout.inventory };
}

function mountCombat(
  session: Session,
  encounterId: string,
  resumeNodeId: string | null = null,
): void {
  showScreen(
    createCombatScreen({
      session,
      encounterId,
      resumeNodeId,
      enemyDelayMs: 0,
    }),
  );
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("combat screen setup", () => {
  it("derives the action bar from the engine and shows the turn order", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    expect(textOf(".nf-combat-title")).toBe("Rustyard Ambush");
    const chips = [...document.querySelectorAll(".nf-init-chip")].map(
      (el) => el.textContent,
    );
    // Vex (Reflexes 6) outrolls both bruisers (4); their mutual order is
    // the seeded initiative tiebreak.
    expect(chips[0]).toBe("Vex");
    expect(chips.slice(1).sort()).toEqual([
      "Rustyard Bruiser 1",
      "Rustyard Bruiser 2",
    ]);

    // Nobody is in melee reach, no consumables, no granted abilities.
    expect(buttonByText("Attack")?.disabled).toBe(true);
    expect(buttonByText("Ability")?.disabled).toBe(true);
    expect(buttonByText("Item")?.disabled).toBe(true);
    expect(buttonByText("Move")?.disabled).toBe(false);
    expect(buttonByText("End Turn")?.disabled).toBe(false);
    const flee = buttonByText("Flee");
    expect(flee?.disabled).toBe(false);
    expect(flee?.textContent).toMatch(/Flee \(\d+%\)/);

    expect(logText()).toMatch(/Hostiles engaged/);
    expect(logText()).toMatch(/— Round 1 —/);
    // Combat entry marks the encounter pending and autosaves.
    expect(session.state.pendingEncounterId).toBe("enc-rustyard-ambush");
    expect(localStorage.getItem("neon-fable:save:autosave")).not.toBeNull();
  });

  it("moves with the arrow keys, spending the engine's step budget", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    expect(textOf(".nf-combat-status")).toMatch(/Steps left 3/);
    pressKey("ArrowUp");
    expect(textOf(".nf-combat-status")).toMatch(/Steps left 2/);
    pressKey("ArrowLeft");
    expect(textOf(".nf-combat-status")).toMatch(/Steps left 1/);
  });
});

describe("victory", () => {
  const won = findFightSeed(
    armedState,
    "enc-rustyard-ambush",
    (fight) =>
      fight.status === "victory" &&
      fight.kinds.has("attack") &&
      fight.kinds.has("ability") &&
      fight.kinds.has("item") &&
      fight.kinds.has("arrow"),
  );

  it("plays a full fight using move, attack, ability, and item actions", () => {
    const session = createSession(armedState(won.seed));
    mountCombat(session, "enc-rustyard-ambush");

    // Replay up to the first attack, then verify the targeting panel
    // shows engine-derived hit chance and damage before confirming.
    const firstAttack = won.fight.steps.findIndex((s) => s.kind === "attack");
    for (const step of won.fight.steps.slice(0, firstAttack)) {
      replayStep(step, { click, pressKey });
    }
    click("Attack");
    expect(
      buttons().some((b) =>
        /% to hit · \d+ dmg/.test(b.textContent ?? ""),
      ),
    ).toBe(true);
    pressKey("Escape"); // cancel targeting; the replay re-opens it
    for (const step of won.fight.steps.slice(firstAttack)) {
      replayStep(step, { click, pressKey });
    }

    // Victory overlay lists the encounter rewards.
    expect(textOf(".nf-combat-outcome")).toMatch(/Victory/);
    expect(textOf(".nf-reward-list")).toMatch(/\+30 cr/);
    expect(textOf(".nf-reward-list")).toMatch(/Surge Stim/);
    expect(logText()).toMatch(/goes down/);

    click("Continue");
    // Back on the hub with the outcome folded into GameState.
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    expect(session.state.flags["combat:enc-rustyard-ambush"]).toBe("victory");
    expect(session.state.pendingEncounterId).toBeNull();
    expect(session.state.credits).toBe(25 + 30);
    expect(countItem(session.state.inventory, "con-surge-stim")).toBe(1);
    if (won.fight.kinds.has("item")) {
      expect(countItem(session.state.inventory, "con-trauma-patch")).toBeLessThan(2);
    }
  });
});

describe("flee", () => {
  function fleeOutcome(seed: number): string {
    const combat = createCombat(courierState(seed), "enc-rustyard-ambush");
    return takeAction(combat, { type: "flee" }).status;
  }

  function seedWhereFlee(wanted: "fled" | "active"): number {
    for (let seed = 1; seed <= 500; seed++) {
      if (fleeOutcome(seed) === wanted) return seed;
    }
    throw new Error(`no seed with flee outcome ${wanted}`);
  }

  it("returns to the hub with the fled flag on a successful flee", () => {
    const session = createSession(courierState(seedWhereFlee("fled")));
    mountCombat(session, "enc-rustyard-ambush");

    click("Flee");
    expect(textOf(".nf-combat-outcome")).toMatch(/Clean Break/);
    click("Return");
    expect(textOf(".nf-hud-status")).toMatch(/Cinder Row Plaza/);
    expect(session.state.flags["combat:enc-rustyard-ambush"]).toBe("fled");
    expect(session.state.pendingEncounterId).toBeNull();
  });

  it("keeps the fight going when the flee attempt fails", () => {
    const session = createSession(courierState(seedWhereFlee("active")));
    mountCombat(session, "enc-rustyard-ambush");

    click("Flee");
    expect(logText()).toMatch(/no opening/);
    expect(textOf(".nf-combat-status")).toMatch(/Action spent/);
    // The turn continues; ending it hands over to the enemies and back.
    click("End Turn");
    expect(textOf(".nf-combat-title")).toBe("Rustyard Ambush");
    expect(textOf(".nf-combat-status")).toMatch(/Action ready/);
  });
});

describe("defeat", () => {
  it("shows the game-over panel and reloads the autosave into a retry", () => {
    // At 1 HP the Static Drone's opening Shock Dart always finishes the
    // fight before the player acts — a deterministic defeat.
    const base = courierState(1);
    const session = createSession({
      ...base,
      player: { ...base.player, hp: 1 },
    });
    mountCombat(session, "enc-auric-scout");

    expect(textOf(".nf-combat-outcome")).toMatch(/Flatlined/);
    expect(session.state.flags["combat:enc-auric-scout"]).toBe("defeat");
    expect(session.state.player.hp).toBe(1);

    // The save browser opens and can be dismissed back to the panel.
    click("Load Game");
    expect(document.querySelector(".nf-saves")).toBeTruthy();
    click("Back");
    expect(textOf(".nf-combat-outcome")).toMatch(/Flatlined/);

    // The autosave was taken at combat entry with the encounter pending,
    // so loading it re-enters the same battle (and the same defeat). The
    // relaunch goes through the game screen, which uses the real enemy
    // pacing — flush its timers to play the opening enemy turn out.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    click("Load Autosave");
    expect(textOf(".nf-combat-title")).toBe("Auric Scout Team");
    vi.runAllTimers();
    expect(textOf(".nf-combat-outcome")).toMatch(/Flatlined/);
    vi.useRealTimers();

    click("Main Menu");
    expect(buttonByText("New Game")).toBeTruthy();
  });
});

describe("scripted policy sanity", () => {
  it("mirrors the engine: scripted fights end and stay bounded", () => {
    const fight = scriptFight(courierState(7), "enc-rustyard-ambush");
    expect(["victory", "defeat", "fled"]).toContain(fight.status);
    expect(fight.steps.length).toBeLessThan(400);
  });
});
