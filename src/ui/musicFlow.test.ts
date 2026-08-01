// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audio } from "../audio";
import { getEncounter, getMap } from "../data";
import { createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * What the score is told, screen by screen.
 *
 * The layer maths is pinned in src/audio; what this covers is the
 * handoff between the two screens that drive it — that walking into a
 * district puts that district's theme on, that starting a fight there
 * keeps it rather than switching tracks, that a named antagonist's
 * fight escalates the mode instead of the music, and that winning
 * hands the street back. A disagreement between the two screens about
 * which theme a place plays would be inaudible in a unit test and very
 * audible in the game.
 *
 * Nothing here makes a sound: no AudioContext exists under happy-dom,
 * so the bus records the scene and schedules nothing.
 */

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

function openMap(location: string, overrides: Partial<GameState> = {}) {
  const state = { ...createNewGame({ playerName: "Vex", seed: 4 }), location };
  const session = createSession({ ...state, ...overrides }, localStorage);
  showScreen(createGameScreen({ session }));
  return session;
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
  setFallbackScreen(createMainMenuScreen);
  audio.setMusicScene(null);
});

afterEach(() => {
  audio.setMusicScene(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the score across the screens", () => {
  it("plays the district the player is standing in", () => {
    openMap("cinder-plaza");
    expect(audio.getMusicScene()).toEqual({
      themeId: "hub",
      mode: "explore",
      dayPhase: getMap("cinder-plaza")?.dayPhase ?? "night",
    });
  });

  it("changes theme when the player changes district", () => {
    openMap("vertical-market");
    expect(audio.getMusicScene()?.themeId).toBe("market");
    openMap("flooded-quays");
    expect(audio.getMusicScene()?.themeId).toBe("quays");
  });

  it("plays an interior at the hour the interior declares", () => {
    const executive = getMap("auric-executive");
    expect(executive?.dayPhase).toBeDefined();
    openMap("auric-executive");
    expect(audio.getMusicScene()).toEqual({
      themeId: "spire",
      mode: "explore",
      dayPhase: executive?.dayPhase,
    });
  });

  it("keeps the district's theme through a fight fought out of it", () => {
    const session = openMap("greywater-steps");
    const before = audio.getMusicScene();
    expect(before?.themeId).toBe("greywater");

    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-pumpworks-court",
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    const during = audio.getMusicScene();
    // Same place, same hour — only what is happening in it changed.
    expect(during?.themeId).toBe(before?.themeId);
    expect(during?.dayPhase).toBe(before?.dayPhase);
    expect(during?.mode).toBe("combat");
  });

  it("escalates a named antagonist's fight to the boss mix", () => {
    expect(getEncounter("enc-exec-warden")?.boss).toBe(true);
    const session = openMap("auric-executive");
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-exec-warden",
        resumeNodeId: null,
        enemyDelayMs: 0,
      }),
    );
    expect(audio.getMusicScene()).toEqual({
      themeId: "spire",
      mode: "boss",
      dayPhase: getMap("auric-executive")?.dayPhase,
    });
  });

  it("fights under the hour a story beat staged, not the map's", () => {
    const session = openMap("cinder-plaza");
    showScreen(
      createCombatScreen({
        session,
        encounterId: "enc-rustyard-ambush",
        resumeNodeId: null,
        dayPhase: "dusk",
        enemyDelayMs: 0,
      }),
    );
    expect(audio.getMusicScene()?.dayPhase).toBe("dusk");
    expect(audio.getMusicScene()?.themeId).toBe("hub");
  });
});
