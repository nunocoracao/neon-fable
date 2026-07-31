// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { injureCharacter } from "../character/injury";
import { makeCombat, makeCombatant } from "../combat/testSupport";
import { requireInjury } from "../data/injuries";
import * as iso from "../iso";
import type { IsoSceneOptions } from "../iso";
import { createNewGame, type GameState } from "../state";
import {
  recruitCompanion,
  setActiveCompanion,
  setCompanionInjury,
} from "../state/party";
import { createCombatScreen } from "./combatScreen";
import { initiativeChips, injuryChip } from "./combatHud";
import { findFightSeed, replayStep } from "./combatTestSupport";
import { createGameScreen } from "./gameScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * Where a wound is *read*: the character screen, the crew screen, and
 * the initiative rail. A debuff a player cannot find is a debuff they
 * experience as bad luck, so each of these asserts the name and the
 * cost are both on the page — not merely that something is marked.
 */

const WINGED = "inj-winged";
const CONCUSSED = "inj-concussed";

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function click(text: string): void {
  const button = [...document.querySelectorAll("button")].find((b) =>
    (b.textContent ?? "").trim().startsWith(text),
  );
  if (!button) throw new Error(`no button labelled "${text}"`);
  button.click();
}

function pressKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function panel(selector: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(selector);
}

function runOn(map: string): GameState {
  return {
    ...createNewGame({ character: fixtureCharacter({}), seed: 11 }),
    location: map,
  };
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const realIsoScene = iso.createIsoScene;
  vi.spyOn(iso, "createIsoScene").mockImplementation((canvas, options: IsoSceneOptions) =>
    realIsoScene(canvas, options),
  );
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the character screen", () => {
  it("says nothing about injuries when there is nothing wrong", () => {
    showScreen(createGameScreen({ session: createSession(runOn("cinder-plaza")) }));
    click("Inventory [I]");
    expect(panel(".nf-injury")).toBeNull();
  });

  it("names the wound, what it costs, and when it closes", () => {
    const base = runOn("cinder-plaza");
    const state: GameState = {
      ...base,
      player: injureCharacter(base.player, WINGED),
    };
    showScreen(createGameScreen({ session: createSession(state) }));
    click("Inventory [I]");

    const section = panel(".nf-injury");
    expect(section).not.toBeNull();
    expect(section?.dataset.injury).toBe(WINGED);
    const def = requireInjury(WINGED);
    expect(section?.textContent).toContain(def.name);
    expect(section?.textContent).toContain(def.effect);
    expect(section?.textContent).toContain(`${def.scenes} more moves`);
  });
});

describe("the crew screen", () => {
  it("reads a companion's wound in the same three parts", () => {
    const base = runOn("cinder-plaza");
    const state: GameState = {
      ...base,
      party: setCompanionInjury(
        setActiveCompanion(recruitCompanion(base.party, "vesper"), "vesper"),
        "vesper",
        { id: CONCUSSED, scenesLeft: 2 },
      ),
    };
    showScreen(createGameScreen({ session: createSession(state) }));
    click("Crew [C]");

    const card = document.querySelector<HTMLElement>(
      '.nf-party-card[data-companion="vesper"]',
    );
    const def = requireInjury(CONCUSSED);
    expect(card?.textContent).toContain(def.name);
    expect(card?.textContent).toContain(def.effect);
    expect(card?.querySelector(".nf-party-injury")).not.toBeNull();
  });

  it("says nothing about a companion who came through fine", () => {
    const base = runOn("cinder-plaza");
    const state: GameState = {
      ...base,
      party: setActiveCompanion(
        recruitCompanion(base.party, "vesper"),
        "vesper",
      ),
    };
    showScreen(createGameScreen({ session: createSession(state) }));
    click("Crew [C]");
    expect(panel(".nf-party-injury")).toBeNull();
  });
});

describe("the victory panel", () => {
  /**
   * A courier who can be caught falling: Second Wind is the one perk
   * that lets a *player* literally go down and get back up, which is
   * the case this panel exists for.
   */
  function battered(seed: number): GameState {
    const allocation = baseStats();
    allocation.body += 5;
    allocation.reflexes += 5;
    allocation.tech += 5;
    const state = createNewGame({
      character: fixtureCharacter({ allocation }),
      seed,
    });
    return {
      ...state,
      player: {
        ...state.player,
        advancement: {
          ...state.player.advancement,
          perkIds: ["perk-second-wind"],
        },
      },
    };
  }

  it("says what the win cost, on the panel it was won on", () => {
    const { seed, fight } = findFightSeed(
      battered,
      "enc-rustyard-ambush",
      (f) =>
        f.status === "victory" &&
        f.combat.log.some(
          (event) =>
            event.type === "second-wind" && event.combatantId === "player",
        ),
      6000,
    );

    const session = createSession(battered(seed));
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-rustyard-ambush",
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    for (const step of fight.steps) {
      if (document.querySelector(".nf-combat-outcome")) break;
      replayStep(step, { click, pressKey });
    }

    const outcome = document.querySelector(".nf-combat-outcome");
    expect(outcome?.textContent).toMatch(/Victory/);
    const wounds = document.querySelector(".nf-injury-list");
    expect(wounds).not.toBeNull();
    const carried = session.state.player.injury!;
    expect(carried).toBeTruthy();
    expect(wounds?.textContent).toContain(requireInjury(carried.id).name);
    expect(wounds?.textContent).toContain(requireInjury(carried.id).effect);
  });
});

describe("the initiative rail", () => {
  function rail() {
    return initiativeChips(
      makeCombat([
        makeCombatant({
          id: "player",
          kind: "player",
          name: "Vex",
          injury: WINGED,
        }),
        makeCombatant({ id: "ally:vesper", kind: "ally", name: "Vesper Kade" }),
        makeCombatant({ id: "nme-1", name: "Runner" }),
      ]),
    );
  }

  it("spells the wound out on the chip rather than leaving an id", () => {
    const chip = rail().find((c) => c.combatantId === "player")!;
    const def = requireInjury(WINGED);
    expect(chip.injury).toEqual({
      id: WINGED,
      name: def.name,
      effect: def.effect,
    });
  });

  it("leaves every unhurt chip clean", () => {
    for (const chip of rail().filter((c) => c.combatantId !== "player")) {
      expect(chip.injury).toBeNull();
    }
  });

  it("says nothing for an injury id this build no longer has", () => {
    expect(
      injuryChip(makeCombatant({ id: "player", injury: "inj-retired" })),
    ).toBeNull();
  });
});
