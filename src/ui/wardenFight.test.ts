// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { bodyTiles, createCombat, requireCombatant } from "../combat";
import { addItem, equip } from "../inventory";
import type { CombatHighlights, TelegraphTileView } from "../iso";
import * as iso from "../iso";
import { createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import { findFightSeed, replayStep } from "./combatTestSupport";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The boss fought through the screen the player actually uses.
 *
 * The engine's own tests prove the block math and the wind-up; the
 * walkthrough proves the beat is reachable and winnable at the state
 * level. This one runs the real combat screen against the real
 * encounter and asks what the *player* would see: a chassis standing on
 * four tiles, a lane of threatened ground the turn before the salvo
 * lands, a condition mark over the thing holding it, and — driving only
 * the buttons and arrow keys — a victory panel at the end.
 *
 * Canvas painting is stubbed; the highlights the screen pushes to the
 * scene are captured instead, because those are what the tinted tiles
 * are drawn from.
 */

const ENCOUNTER_ID = "enc-exec-warden";

/** Every set of highlights the screen has pushed, newest last. */
let highlights: CombatHighlights[] = [];

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

function logText(): string {
  return document.querySelector(".nf-combat-log")?.textContent ?? "";
}

function chipNames(): string[] {
  return [...document.querySelectorAll(".nf-init-name")].map(
    (el) => el.textContent ?? "",
  );
}

/** The tints currently on one tile, across every push so far. */
function tintsAt(x: number, y: number): TelegraphTileView[] {
  return highlights.flatMap((h) =>
    h.tiles.filter((t) => t.x === x && t.y === y),
  );
}

/**
 * A late-act fighter kitted the way a player who got this far would be:
 * a tier-2 sidearm and field kits to spend on the long fight.
 */
function claimantState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 4;
  allocation.reflexes += 6;
  allocation.cool += 5;
  const state = createNewGame({
    character: fixtureCharacter({ allocation }),
    seed,
  });
  let inventory = addItem(state.inventory, "wpn-rail-spitter", 1);
  inventory = addItem(inventory, "con-trauma-patch", 2);
  const loadout = equip(state.player, inventory, "wpn-rail-spitter");
  return { ...state, player: loadout.character, inventory: loadout.inventory };
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  highlights = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  // The real scene, with the one call the tinted tiles arrive through
  // recorded on the way past.
  const real = iso.createCombatScene;
  vi.spyOn(iso, "createCombatScene").mockImplementation((canvas, options) => {
    const scene = real(canvas, options);
    return {
      ...scene,
      setHighlights(next: Partial<CombatHighlights>): void {
        if (next.tiles) {
          highlights.push({
            tiles: next.tiles,
            pathLine: next.pathLine ?? [],
            hover: next.hover ?? null,
          });
        }
        scene.setHighlights(next);
      },
    };
  });
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Warden Chassis, on the screen", () => {
  it("opens the fight with the chassis in the rail and on four tiles", () => {
    const session = createSession(claimantState(1));
    showScreen(
      createCombatScreen({
        session,
        encounterId: ENCOUNTER_ID,
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    expect(document.querySelector(".nf-combat-title")?.textContent).toBe(
      "The Warden Chassis",
    );
    expect(chipNames()).toContain("Warden Chassis");

    // The engine's own view of the same fight: the block it stands on.
    const combat = createCombat(session.state, ENCOUNTER_ID);
    const chassis = combat.combatants.find((c) => c.kind === "enemy")!;
    expect(bodyTiles(chassis)).toHaveLength(4);

    // Opening Attack tints its reach, and the chassis's own tiles are
    // all inside it: any of the four is a place to aim at.
    click("Attack");
    const range = highlights.at(-1)!.tiles;
    for (const tile of bodyTiles(chassis)) {
      expect(
        range.some((t) => t.x === tile.x && t.y === tile.y),
        `(${tile.x}, ${tile.y}) is aimable`,
      ).toBe(true);
    }
  });

  it("marks the ground a turn before the salvo lands on it", () => {
    // A seed whose fight the chassis actually wins the wind-up race in:
    // any victory will do, since it always opens with the volley.
    const { seed, fight } = findFightSeed(
      claimantState,
      ENCOUNTER_ID,
      (f) => f.status === "victory",
      200,
    );
    const session = createSession(claimantState(seed));
    showScreen(
      createCombatScreen({
        session,
        encounterId: ENCOUNTER_ID,
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    // Play until the chassis has declared its volley.
    let steps = 0;
    while (steps < fight.steps.length && !logText().includes("winds up")) {
      replayStep(fight.steps[steps]!, { click, pressKey });
      steps++;
    }
    expect(logText(), "the chassis announced a wind-up").toContain("winds up");
    expect(logText()).toContain("Shoulder Volley");

    // Threatened ground is tinted from that instant, and the player is
    // standing in it — this is the turn to move.
    const threatened = highlights
      .at(-1)!
      .tiles.filter((t) => t.tint === "threat");
    expect(threatened.length, "the lane is marked").toBeGreaterThan(0);
    const player = requireCombatant(
      createCombat(session.state, ENCOUNTER_ID),
      "player",
    );
    expect(tintsAt(player.position.x, player.position.y).length).toBeGreaterThan(
      0,
    );

    // Play the rest: the salvo lands (or misses) on the chassis's own
    // next turn, and the marked ground clears with it.
    while (steps < fight.steps.length) {
      const button = buttonByText("Continue");
      if (button) break;
      replayStep(fight.steps[steps]!, { click, pressKey });
      steps++;
    }
    expect(logText()).toContain("looses Shoulder Volley");
    expect(
      highlights.at(-1)!.tiles.some((t) => t.tint === "threat"),
      "the lane clears once it has been fired",
    ).toBe(false);
  });

  it("can be beaten with nothing but the buttons and the arrow keys", () => {
    const { seed, fight } = findFightSeed(
      claimantState,
      ENCOUNTER_ID,
      (f) => f.status === "victory",
      200,
    );
    const session = createSession(claimantState(seed));
    showScreen(
      createCombatScreen({
        session,
        encounterId: ENCOUNTER_ID,
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    for (const step of fight.steps) {
      if (buttonByText("Continue")) break;
      replayStep(step, { click, pressKey });
    }
    expect(logText()).toContain("Warden Chassis goes down.");
    expect(document.querySelector(".nf-combat-outcome h2")?.textContent).toBe(
      "Victory",
    );
    // And the fight folded back into the save the way any fight does.
    expect(session.state.flags[`combat:${ENCOUNTER_ID}`]).toBe("victory");
  });
});
