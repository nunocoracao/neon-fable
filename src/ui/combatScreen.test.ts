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

/** The initiative rail's chips, in rail order. */
function chips(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-init-chip")];
}

function chipNames(): string[] {
  return chips().map((el) => el.querySelector(".nf-init-name")?.textContent ?? "");
}

function chipFor(name: string): HTMLElement {
  const found = chips().find(
    (el) => el.querySelector(".nf-init-name")?.textContent === name,
  );
  if (!found) throw new Error(`no initiative chip for "${name}"`);
  return found;
}

/** An action-bar button by the action it runs (not by its face text). */
function actionButton(kind: string): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    `.nf-action-button[data-action="${kind}"]`,
  );
  if (!button) throw new Error(`no action button for "${kind}"`);
  return button;
}

function hover(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("mouseenter"));
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
    const chips = chipNames();
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

describe("initiative rail", () => {
  it("gives every combatant a portrait, an HP bar, and its place in the queue", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    const vex = chipFor("Vex");
    expect(vex.querySelector("canvas.nf-portrait")).toBeTruthy();
    expect(vex.classList.contains("nf-init-active")).toBe(true);
    expect(vex.querySelector(".nf-init-turn")?.textContent).toBe("NOW");
    expect(vex.querySelector(".nf-init-hp-fill")).toBeTruthy();
    expect(vex.title).toMatch(/^Vex — HP \d+\/\d+$/);

    // The rest are queued behind, counted off rather than reshuffled.
    const queued = chips()
      .filter((el) => !el.classList.contains("nf-init-active"))
      .map((el) => el.querySelector(".nf-init-turn")?.textContent);
    expect(queued.sort()).toEqual(["+1", "+2"]);
  });

  it("keeps rail order while the highlight walks to whoever is up", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");
    const order = chipNames();

    click("End Turn"); // hands over; the enemy phase runs synchronously
    // Order is fixed for the whole fight; only the highlight moved.
    expect(chipNames()).toEqual(order);
    expect(chipFor("Vex").classList.contains("nf-init-active")).toBe(true);
  });

  it("greys out and collapses a chip when its combatant goes down", () => {
    const won = findFightSeed(
      armedState,
      "enc-rustyard-ambush",
      (fight) => fight.status === "victory",
    );
    const session = createSession(armedState(won.seed));
    mountCombat(session, "enc-rustyard-ambush");

    expect(chips().some((el) => el.classList.contains("nf-init-dead"))).toBe(
      false,
    );
    for (const step of won.fight.steps) replayStep(step, { click, pressKey });

    // Both bruisers are down, and their chips are still in the rail.
    const dead = chips().filter((el) =>
      el.classList.contains("nf-init-dead"),
    );
    expect(dead.length).toBe(2);
    expect(chipNames().length).toBe(3);
    // A collapsed chip drops its bar and its turn number, not its name.
    expect(dead[0]?.querySelector(".nf-init-hp")).toBeNull();
    expect(dead[0]?.querySelector(".nf-init-turn")).toBeNull();
    expect(dead[0]?.querySelector(".nf-init-name")?.textContent).toMatch(
      /Rustyard Bruiser/,
    );
  });
});

describe("a full fight through the new HUD", () => {
  const won = findFightSeed(
    armedState,
    "enc-rustyard-ambush",
    (fight) =>
      fight.status === "victory" &&
      fight.kinds.has("attack") &&
      fight.kinds.has("ability") &&
      fight.kinds.has("arrow"),
  );

  it("keeps the rail, the bar, and the card coherent from first blow to last", () => {
    const session = createSession(armedState(won.seed));
    mountCombat(session, "enc-rustyard-ambush");

    for (const step of won.fight.steps) {
      replayStep(step, { click, pressKey });
      if (document.querySelector(".nf-combat-outcome")) break;

      // Exactly one combatant is up, and it is one still standing.
      const live = chips().filter(
        (el) => !el.classList.contains("nf-init-dead"),
      );
      const active = chips().filter((el) =>
        el.classList.contains("nf-init-active"),
      );
      expect(active.length).toBe(1);
      expect(live).toContain(active[0]);

      // The rail never loses a combatant, and a defeated one keeps its
      // name while losing its bar.
      expect(chipNames().length).toBe(3);
      for (const el of chips()) {
        const dead = el.classList.contains("nf-init-dead");
        expect(!!el.querySelector(".nf-init-hp")).toBe(!dead);
        expect(el.querySelector(".nf-init-name")?.textContent?.length ?? 0)
          .toBeGreaterThan(0);
      }

      // End Turn is always on the table on the player's own turn, and
      // every button says something either way.
      expect(actionButton("end-turn").disabled).toBe(false);
      for (const kind of ["attack", "ability", "item", "move", "flee"]) {
        expect(actionButton(kind).title.length, kind).toBeGreaterThan(0);
      }
    }

    expect(textOf(".nf-combat-outcome")).toMatch(/Victory/);
    // Both bruisers ended the fight greyed out, and the rail with them.
    expect(
      chips().filter((el) => el.classList.contains("nf-init-dead")).length,
    ).toBe(2);
    // Nothing is up once the fight is over.
    expect(
      chips().filter((el) => el.classList.contains("nf-init-active")).length,
    ).toBe(0);
  });
});

describe("action bar", () => {
  it("gives each button an icon, a hotkey, and a reason when it is off", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    for (const kind of ["attack", "ability", "item", "move", "flee", "end-turn"]) {
      const button = actionButton(kind);
      expect(button.querySelector("canvas.nf-action-glyph"), kind).toBeTruthy();
      expect(button.querySelector(".nf-action-hotkey")?.textContent, kind)
        .toMatch(/^[1-6]$/);
      expect(button.title.length, kind).toBeGreaterThan(0);
    }

    // Nobody is in reach and nothing is carried, so the reasons differ.
    expect(actionButton("attack").disabled).toBe(true);
    expect(actionButton("attack").title).toBe("Out of range — move closer.");
    expect(actionButton("ability").title).toBe("No abilities installed.");
    expect(actionButton("item").title).toBe("No usable items carried.");
    // An available button quotes the engine's own figures instead.
    expect(actionButton("move").disabled).toBe(false);
    expect(actionButton("move").title).toMatch(/3 steps left · \d+ tiles in reach/);
  });

  it("runs the bar from the number keys", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    // 4 is Move: the arena lights up the tiles the engine will accept.
    pressKey("4");
    expect(textOf(".nf-combat-hint")).toMatch(/Click a highlighted tile/);
    pressKey("Escape");
    expect(textOf(".nf-combat-hint")).toMatch(/Choose an action/);

    // 6 is End Turn, and it goes through the engine like the button.
    expect(textOf(".nf-combat-status")).toMatch(/Steps left 3/);
    pressKey("6");
    expect(textOf(".nf-combat-status")).toMatch(/Steps left 3/);
    expect(logText()).toMatch(/Round 2/);
  });

  it("ignores the hotkey of a button the engine has disabled", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    // 1 is Attack, and nothing is in reach — pressing it changes nothing.
    expect(actionButton("attack").disabled).toBe(true);
    pressKey("1");
    expect(textOf(".nf-combat-hint")).toMatch(/Choose an action/);
  });

  it("locks the bar with one reason while the enemy phase plays", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const session = createSession(courierState(1));
    // Real pacing, so the enemy phase is still running when we look.
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-rustyard-ambush",
        resumeNodeId: null,
      }),
    );
    click("End Turn");

    for (const kind of ["attack", "move", "end-turn"]) {
      expect(actionButton(kind).disabled, kind).toBe(true);
      expect(actionButton(kind).title, kind).toBe("Not your turn.");
    }
    vi.runAllTimers();
    expect(actionButton("end-turn").disabled).toBe(false);
    vi.useRealTimers();
  });
});

describe("target card", () => {
  it("stays hidden until something is pointed at", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");
    expect(
      document.querySelector<HTMLElement>(".nf-target-card")?.hidden,
    ).toBe(true);
  });

  it("reads a hovered combatant's portrait, HP, armor and weapon", () => {
    const session = createSession(courierState(1));
    mountCombat(session, "enc-rustyard-ambush");

    hover(chipFor("Rustyard Bruiser 1"));
    const card = document.querySelector<HTMLElement>(".nf-target-card")!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector("canvas.nf-portrait")).toBeTruthy();
    expect(textOf(".nf-target-name")).toBe("Rustyard Bruiser 1");
    expect(textOf(".nf-target-hp-text")).toMatch(/^HP \d+\/\d+$/);
    expect(textOf(".nf-target-stats")).toMatch(/Armor \d+/);
    expect(textOf(".nf-target-stats")).toMatch(/\d+ away/);
    // Out of melee reach at the start, so no shot is quoted.
    expect(card.querySelector(".nf-target-attack")).toBeNull();
  });

  it("quotes the engine's shot once a target is in reach", () => {
    const won = findFightSeed(
      armedState,
      "enc-rustyard-ambush",
      (fight) => fight.status === "victory" && fight.kinds.has("attack"),
    );
    const session = createSession(armedState(won.seed));
    mountCombat(session, "enc-rustyard-ambush");

    const firstAttack = won.fight.steps.findIndex((s) => s.kind === "attack");
    for (const step of won.fight.steps.slice(0, firstAttack)) {
      replayStep(step, { click, pressKey });
    }
    // Opening the targeting panel inspects the first legal target for
    // free — the card is beside the choice, not a hover away from it.
    click("Attack");
    expect(textOf(".nf-target-attack")).toMatch(
      /^Your shot: \d+ dmg · \d+% to hit$/,
    );
    expect(textOf(".nf-target-name").length).toBeGreaterThan(0);
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
