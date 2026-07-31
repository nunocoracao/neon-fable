// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { abilities } from "../data";
import { ABILITY_FX, DAY_PHASES, STATUS_FAMILY_IDS } from "../iso";
import { ABILITY_FX_ART } from "../iso/art/abilityEffects";
import { bakeSprite } from "../iso/art/pixel";
import { STATUS_MARKER_ART } from "../iso/art/statusMarkers";
import { phasePalette } from "../iso/art/tint";
import { createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * Every ability, cast in a real fight through the real screen: the
 * engine resolves the action, the combat screen turns the event into a
 * cast, the scene plays the archetype the ability's content names, and
 * the pixel provider bakes the frames. Nothing here is stubbed but the
 * canvas itself — and the canvas is a recorder, so what is asserted is
 * which baked picture the fight actually drew.
 *
 * Baked canvases are identified by the paint they received: the test
 * bakes every registered ability and status picture through the same
 * bakeSprite the provider uses, in every hour the arena can be fought
 * under, and matches the recorded fill calls. That makes an assertion
 * here a statement about the pixels on screen rather than about a call
 * into the scene.
 *
 * This is the in-game sweep behind the archetype work: if an ability
 * ever loses its look, or picks up the wrong one, one of these fails.
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

const ENCOUNTER_ID = "enc-auric-scout";

/** Paint recorded off one canvas, as a string only its own art produces. */
const paintOf = new Map<object, string[]>();
/** Pictures drawn onto a scene canvas this frame, by what they were. */
let drawn: string[] = [];
let clock = 0;
let frameCallback: FrameRequestCallback | null = null;

function signature(ops: readonly string[]): string {
  return ops.join(";");
}

/** A 2D context that records what is painted into it and what is drawn. */
function recordingContext(canvas: object): CanvasRenderingContext2D {
  const ops: string[] = [];
  paintOf.set(canvas, ops);
  const fallback = anything() as Record<string | symbol, unknown>;
  let fillStyle = "";
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "fillStyle") return fillStyle;
        if (prop === "canvas") return canvas;
        if (prop === "fillRect") {
          return (x: number, y: number, w: number, h: number): void => {
            ops.push(`${fillStyle}|${x},${y},${w},${h}`);
          };
        }
        if (prop === "drawImage") {
          return (image: object): void => {
            const painted = paintOf.get(image);
            if (painted && painted.length > 0) drawn.push(signature(painted));
          };
        }
        return fallback[prop];
      },
      set: (_target, prop, value) => {
        if (prop === "fillStyle") fillStyle = String(value);
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}

/**
 * Every ability and status picture, baked the way the provider bakes it,
 * in every hour a fight can happen under — so a recorded paint names the
 * archetype it came from whatever the arena's clock said.
 */
function knownPictures(): Map<string, string> {
  const known = new Map<string, string>();
  for (const phase of DAY_PHASES) {
    const palette = phasePalette(phase);
    const add = (id: string, frames: readonly (readonly string[])[]): void => {
      for (const grid of frames) {
        const sprite = bakeSprite(grid, 0, 0, palette);
        const ops = paintOf.get(sprite.image) ?? [];
        known.set(signature(ops), id);
      }
    };
    for (const [id, art] of Object.entries(ABILITY_FX_ART)) add(id, art.frames);
    for (const id of STATUS_FAMILY_IDS) {
      add(`status:${id}`, STATUS_MARKER_ART[id].frames);
    }
  }
  return known;
}

let pictures = new Map<string, string>();

/** Which known pictures the fight has drawn since the list was cleared. */
function drawnIds(): string[] {
  const ids: string[] = [];
  for (const sig of drawn) {
    const id = pictures.get(sig);
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Run the scene's frame loop over a stretch of the scene clock. */
function play(ms: number, stepMs = 20): void {
  drawn = [];
  for (let t = 0; t <= ms; t += stepMs) {
    clock += stepMs;
    frameCallback?.(clock);
  }
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

function statusLine(): string {
  return document.querySelector(".nf-combat-status")?.textContent ?? "";
}

function logText(): string {
  return document.querySelector(".nf-combat-log")?.textContent ?? "";
}

/** A fighter who has learned everything there is to learn. */
function adeptState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 6;
  allocation.reflexes += 5;
  allocation.tech += 4;
  const state = createNewGame({
    character: fixtureCharacter({ allocation }),
    seed,
  });
  return {
    ...state,
    player: {
      ...state.player,
      advancement: {
        pointsSpent: 0,
        abilityIds: abilities.map((a) => a.id),
        perkIds: [],
      },
    },
  };
}

/** One step toward the scouts; false when the player cannot take it. */
function stepToward(): boolean {
  for (const key of ["ArrowRight", "ArrowUp", "ArrowDown"]) {
    const before = statusLine();
    pressKey(key);
    if (statusLine() !== before) return true;
  }
  return false;
}

/**
 * Cast an ability the way a player does: open the ability list, pick it,
 * pick a target if it needs one. Walks in and passes turns until the
 * ability has somebody to reach, which is what a melee ability means.
 */
function castAbility(name: string): void {
  for (let guard = 0; guard < 40; guard++) {
    const ability = buttonByText("Ability");
    if (ability && !ability.disabled) {
      click("Ability");
      const option = buttonByText(name);
      if (option && !option.disabled) {
        option.click();
        // A thrown ability now lists its targets; a self buff has
        // already gone off.
        const target = [
          ...document.querySelectorAll<HTMLButtonElement>(
            ".nf-combat-selection .nf-choice",
          ),
        ][0];
        if (target) target.click();
        return;
      }
      pressKey("Escape");
    }
    if (!stepToward()) click("End Turn");
  }
  throw new Error(`could not cast "${name}"`);
}

beforeEach(() => {
  document.body.innerHTML =
    '<canvas id="iso-canvas"></canvas><div id="ui-root"></div>';
  clock = 1000;
  drawn = [];
  frameCallback = null;
  paintOf.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      return recordingContext(this);
    } as never,
  );
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frameCallback = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  localStorage.clear();
  initScreenRouter(document.getElementById("ui-root")!);
  pictures = knownPictures();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountFight(seed = 5): void {
  showScreen(
    createCombatScreen({
      session: createSession(adeptState(seed)),
      encounterId: ENCOUNTER_ID,
      resumeNodeId: null,
      enemyDelayMs: 0,
    }),
  );
}

describe("every ability, cast in a real fight", () => {
  for (const ability of abilities) {
    const spec = ABILITY_FX[ability.effectRef];

    it(`shows ${ability.name} as ${ability.effectRef}`, () => {
      mountFight();
      castAbility(ability.name);
      expect(logText()).toContain(ability.name);
      // A charged ability is declared, not thrown: nothing leaves the
      // caster until the turn it fires on (see src/combat/charge.ts),
      // so the archetype cannot have played yet.
      if ((ability.windUp ?? 0) > 0) {
        play(400);
        expect(
          drawnIds(),
          `${ability.name} threw nothing while winding up`,
        ).not.toContain(ability.effectRef);
        // The mark over the caster is what says it is coming.
        expect(drawnIds()).toContain("status:charging");
        click("End Turn");
      }
      // The whole cast: wind-up, effect, and the tail of it.
      play(spec.frameMs * spec.frameCount * spec.loops + 400);
      expect(drawnIds(), `${ability.name} drew its archetype`).toContain(
        ability.effectRef,
      );
    });
  }
});

describe("what the fight leaves on a body", () => {
  it("marks a boosted fighter for as long as the boost lasts", () => {
    mountFight();
    castAbility("Bulwark Surge");
    play(600);
    // The aura played, and the plating mark is up under it.
    expect(drawnIds()).toContain("guard-shimmer");
    play(400);
    expect(drawnIds()).toContain("status:guarded");
    // Two turns of it (the boost's own duration), then it lifts.
    for (let turn = 0; turn < 6; turn++) click("End Turn");
    play(400);
    expect(drawnIds()).not.toContain("status:guarded");
  });

  it("marks a stunned fighter until it gets its turn back", () => {
    mountFight();
    castAbility("Stun Strike");
    play(900);
    expect(drawnIds()).toContain("shock-arc");
    // A stun that landed says so in the log, and over the body.
    // The turn it costs is true of the target the moment the strike
    // lands, so the mark is up over it from the next frame on.
    expect(drawnIds()).toContain("status:stunned");
  });
});
