// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import {
  activeCombatant,
  createCombat,
  isPlayerControlled,
} from "../combat";
import { noAssists } from "../data/assists";
import { requireEncounter } from "../data/encounters";
import { addItem, equip } from "../inventory";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { recruitCompanion } from "../state/party";
import { createCombatScreen } from "./combatScreen";
import { findFightSeed, replayStep } from "./combatTestSupport";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * A fight with somebody else in it.
 *
 * A companion is a unit the *player* plays: same action bar, same
 * modes, same arrow keys, only a different body spending the turn (see
 * playerCanAct in ./combatScreen.ts). Nothing was holding that join
 * down, and a bug sweep found what happens when it slips — the scripted
 * fight tooling (./combatTestSupport.ts) was reading the player's HP
 * and the player's feet on a companion's turn, so it recorded arrow
 * gestures that walk the wrong body. The engine applied the recorded
 * *move*, the screen applied the recorded *key*, and from the second
 * turn onwards the two were playing different fights: the replay hit an
 * "Attack" the screen had greyed out because the ally was standing a
 * tile away from where the simulation thought it was.
 *
 * So this test replays a whole crewed boss fight through the DOM and
 * insists every recorded gesture is one the screen will still take. A
 * policy that plays the wrong body fails on the first step after the
 * ally moves, which is exactly where it started lying.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : anything()),
    set: () => true,
    apply: () => anything(),
  });
}

function buttons(): HTMLButtonElement[] {
  return [...document.querySelectorAll("button")];
}
function click(text: string): void {
  const button = buttons().find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
  if (!button) throw new Error(`no button "${text}"`);
  if (button.disabled) throw new Error(`button "${text}" is disabled`);
  button.click();
}
function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

/** A courier with Vesper along, stood in front of the Crown Ring. */
function crewState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 5;
  allocation.cool += 5;
  allocation.tech += 3;
  allocation.reflexes += 2;
  const state = createNewGame({
    character: fixtureCharacter({
      backgroundId: "gutter-courier",
      allocation,
    }),
    seed,
    rules: { difficulty: "grind", assists: noAssists(), difficultyChanged: false },
  });
  let inventory = state.inventory;
  for (const id of [
    "con-trauma-patch",
    "con-field-kit",
    "wpn-rail-spitter",
    "out-cordon-plate",
  ]) {
    inventory = addItem(inventory, id);
  }
  let loadout = equip(state.player, inventory, "wpn-rail-spitter");
  loadout = equip(loadout.character, loadout.inventory, "out-cordon-plate");
  return {
    ...state,
    player: loadout.character,
    inventory: loadout.inventory,
    party: recruitCompanion(state.party, "vesper"),
    pendingEncounterId: "enc-crown-court",
  };
}

/** The fight the tooling scripts: a won one, with a companion move in it. */
const CREWED = findFightSeed(
  crewState,
  "enc-crown-court",
  (fight) => fight.status === "victory" && fight.kinds.has("arrow"),
);

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  settings.update({ ...DEFAULT_SETTINGS });
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a boss fought with a companion along", () => {
  it("gives the ally the bar, and every recorded gesture lands", () => {
    const session = createSession(crewState(CREWED.seed));
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-crown-court",
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );

    // The crew is on the rail: the player, the companion, and the boss.
    const names = [...document.querySelectorAll(".nf-init-name")].map(
      (el) => el.textContent,
    );
    expect(names).toContain("Vesper Kade");
    expect(names).toContain("Vex");
    expect(requireEncounter("enc-crown-court").boss).toBe(true);

    // Every gesture the tooling recorded is one the screen accepts —
    // this is the assertion that fails when the two drift apart, and it
    // fails on the first step that does.
    for (const step of CREWED.fight.steps) {
      replayStep(step, { click, pressKey });
    }

    expect(document.querySelector(".nf-panel h2")?.textContent).toBe("Victory");
  });

  it("spends the ally's own frame and steps, not the player's", () => {
    // Vesper is quicker than this courier, so the bar opens on her —
    // which is the turn the tooling used to play as though it were the
    // player's. What the row says is the check: it names the body being
    // played and quotes that body's frame.
    const engine = createCombat(crewState(CREWED.seed), "enc-crown-court");
    const first = activeCombatant(engine);
    expect(first.kind).toBe("ally");
    expect(isPlayerControlled(first)).toBe(true);

    const session = createSession(crewState(CREWED.seed));
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-crown-court",
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    const status = document.querySelector(".nf-combat-status")?.textContent ?? "";
    expect(status).toMatch(/Vesper Kade — HP/);
    expect(status).toContain(`${first.hp}/${first.maxHp}`);
    // And it is not quoting the player's frame while it does.
    const player = engine.combatants.find((c) => c.kind === "player")!;
    expect(player.maxHp).not.toBe(first.maxHp);
    expect(status).not.toContain(`${player.hp}/${player.maxHp}`);
  });
});
