// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertFlag, stealthZoneFlag, takedownFlag } from "../data/stealth";
import { requireMap } from "../data/maps";
import { initialCamera, worldToViewport } from "../iso/camera";
import { worldToScreen } from "../iso/coords";
import type { FlagValue } from "../state/flags";
import { createNewGame, type GameState } from "../state";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { initScreenRouter, setFallbackScreen, showScreen } from "./screen";
import { createSession, type Session } from "./session";

/**
 * The assembled crossing: a real game screen, a real iso scene, the real
 * zones, driven frame by frame with the player walked around by clicking
 * the canvas the way a player would.
 *
 * The rules are tested apart from this (src/stealth/); what is pinned
 * here is the wiring — that walking onto a watched floor posts the
 * watch, that the crouch key reaches it, that being seen puts the wash
 * up and hands the fight the alert it reads at setup, and that reaching
 * the far side opens the beat that makes the aisle yours.
 */

const EXEC_MAP = "auric-executive";
/** Where the riser puts an arrival down, and the tick clock's origin. */
const SPAWN = { x: 6, y: 9 };

function anything(): unknown {
  const fn = (): unknown => anything();
  return new Proxy(fn, {
    get: (_target, prop) =>
      prop === Symbol.toPrimitive ? () => 0 : anything(),
    set: () => true,
    apply: () => anything(),
  });
}

let pending: FrameRequestCallback | null = null;

function frame(timeMs: number): void {
  const next = pending;
  pending = null;
  next?.(timeMs);
}

/** Runs `ms` of frames at 100ms a frame, starting from `from`. */
function play(ms: number, from = 0): void {
  for (let t = from; t <= from + ms; t += 100) frame(t);
}

function canvas(): HTMLCanvasElement {
  return document.getElementById("iso-canvas") as HTMLCanvasElement;
}

/**
 * Clicks a tile. The camera opens centred on the arrival spawn and
 * nothing in these tests pans it, so where a tile lands on screen is
 * the same derivation the scene itself uses.
 */
function clickTile(tile: { x: number; y: number }): void {
  const camera = initialCamera(requireMap(EXEC_MAP), SPAWN, 960, 640, 1);
  const { sx, sy } = worldToScreen(tile.x, tile.y);
  const at = worldToViewport(camera, 960, 640, 1, sx, sy);
  for (const type of ["pointerdown", "pointerup"]) {
    const event = new Event(type);
    Object.assign(event, {
      button: 0,
      clientX: at.x,
      clientY: at.y,
      pointerId: 1,
    });
    canvas().dispatchEvent(event);
  }
}

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

function hud(): string {
  return document.querySelector(".nf-hud-status")?.textContent ?? "";
}

function prompt(): string {
  const el = document.querySelector(".nf-interact-prompt");
  return el?.classList.contains("nf-interact-prompt-visible")
    ? (el.textContent ?? "")
    : "";
}

function dialogueText(): string {
  return document.querySelector(".nf-dialogue-text")?.textContent ?? "";
}

/** Takes the first choice the open conversation is offering. */
function takeFirstChoice(): void {
  const choice = document.querySelector<HTMLButtonElement>(".nf-choice");
  choice?.click();
}

function openFloor(flags: Record<string, FlagValue> = {}): Session {
  const base = createNewGame({ playerName: "Vex", seed: 5 });
  const state: GameState = {
    ...base,
    location: EXEC_MAP,
    flags: { ...base.flags, ...flags },
  };
  const session = createSession(state, localStorage);
  showScreen(createGameScreen({ session }));
  frame(0);
  return session;
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  const el = canvas();
  Object.defineProperty(el, "clientWidth", { value: 960 });
  Object.defineProperty(el, "clientHeight", { value: 640 });
  // happy-dom has no pointer capture; the scene calls both on a press.
  Object.assign(el, {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => anything() as CanvasRenderingContext2D,
  );
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  setFallbackScreen(createMainMenuScreen);
});

afterEach(() => {
  pending = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("walking onto a watched floor", () => {
  it("posts the watch, and says how you are moving", () => {
    openFloor();
    expect(hud()).toContain("Standing [X]");
  });

  it("posts nothing at all on an ordinary street", () => {
    const base = createNewGame({ playerName: "Vex", seed: 5 });
    const session = createSession(base, localStorage);
    showScreen(createGameScreen({ session }));
    frame(0);
    expect(hud()).not.toContain("Standing");
    // And the crossing keys are dead there.
    press("x");
    press("f");
    expect(hud()).not.toContain("Crouched");
  });

  it("takes the crouch key, both ways round", () => {
    openFloor();
    press("x");
    expect(hud()).toContain("Crouched [X]");
    press("x");
    expect(hud()).toContain("Standing [X]");
  });

  it("does not post a watch whose fight has already been had", () => {
    openFloor({ "combat:enc-exec-security": "victory" });
    expect(hud()).not.toContain("Standing [X]");
  });
});

describe("being seen", () => {
  it("puts the wash up, arms the fight, and opens the beat", () => {
    const session = openFloor();
    // Straight up the middle of the floor, through both patrol lanes.
    clickTile({ x: 5, y: 4 });
    play(8000);
    expect(session.state.flags[stealthZoneFlag("exec-detail")]).toBe("spotted");
    expect(session.state.flags[alertFlag("enc-exec-security")]).toBe(true);
    expect(document.querySelector(".nf-alert-flash")).not.toBeNull();
    expect(dialogueText().length).toBeGreaterThan(0);
  });

  it("hands the fight over when the beat is taken", () => {
    const session = openFloor();
    clickTile({ x: 5, y: 4 });
    play(8000);
    takeFirstChoice();
    expect(session.state.pendingEncounterId).toBe("enc-exec-security");
    // The alert is still standing when the fight is built, which is the
    // whole of what being caught costs (see src/combat/setup.ts).
    expect(session.state.flags[alertFlag("enc-exec-security")]).toBe(true);
  });

  it("stops the watch once it has settled: no second wash, no second beat", () => {
    const session = openFloor();
    clickTile({ x: 5, y: 4 });
    play(8000);
    const flags = { ...session.state.flags };
    play(8000, 9000);
    expect(session.state.flags).toEqual(flags);
  });
});

describe("getting past", () => {
  /**
   * The east lane, with the lead already stood down and the drone off
   * the roster: what is left is the second, whose lane is the far side
   * of the floor and whose cone never reaches column eleven. A crossing
   * with the odds already shortened, so what this pins is the wiring
   * rather than anybody's timing.
   */
  function quietFloor(): Session {
    return openFloor({
      [takedownFlag("exec-detail", "lead")]: true,
      "exec-muster-dark": true,
    });
  }

  /**
   * Round the south side and up column eleven — round the alcove the
   * lane is pinched at, rather than over it, because a dash is a
   * shortcut and never the only way through.
   */
  function walkTheEastLane(): void {
    clickTile({ x: 10, y: 9 });
    play(4000);
    clickTile({ x: 11, y: 6 });
    play(6000, 4100);
    clickTile({ x: 11, y: 1 });
    play(8000, 10200);
  }

  it("opens the quiet beat on reaching the far side", () => {
    const session = quietFloor();
    walkTheEastLane();
    expect(session.state.flags[stealthZoneFlag("exec-detail")]).toBe("passed");
    expect(session.state.flags[alertFlag("enc-exec-security")]).toBeUndefined();
    expect(dialogueText().length).toBeGreaterThan(0);
  });

  it("makes the aisle yours without the fight ever being offered", () => {
    const session = quietFloor();
    walkTheEastLane();
    takeFirstChoice();
    expect(session.state.flags["exec-cleared"]).toBe(true);
    expect(session.state.flags["exec-quiet"]).toBe(true);
    expect(session.state.pendingEncounterId).toBeNull();
    expect(session.state.flags["exec-forced"]).toBeUndefined();
  });
});

describe("the dash at a pinch point", () => {
  it("is offered on the pinch's own tile and taken with one key", () => {
    openFloor({ "exec-muster-dark": true });
    clickTile({ x: 11, y: 8 });
    play(4000);
    expect(prompt()).toBe("F — lunge past the pinch in the east lane");
    press("f");
    frame(4100);
    // Two tiles further on, where there is no gap to dash across.
    expect(prompt()).not.toContain("lunge");
  });
});
