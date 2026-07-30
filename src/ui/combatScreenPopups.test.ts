// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { baseStats } from "../character";
import { fixtureCharacter } from "../character/testSupport";
import { abilities } from "../data";
import { POPUP_KINDS, STATUS_FAMILY_IDS, statusPopupLabel, type PopupKind } from "../iso";
import { bakeSprite } from "../iso/art/pixel";
import { popupTextGrid } from "../iso/art/popupFont";
import { addItem, installEnhancement } from "../inventory";
import { createNewGame, type GameState } from "../state";
import { createCombatScreen } from "./combatScreen";
import { initScreenRouter, showScreen } from "./screen";
import { createSession } from "./session";

/**
 * The readouts a real fight actually puts on the arena, through the real
 * screen: the engine resolves the action, the screen derives the
 * reading from the log entry it produced, and the pixel provider bakes
 * the glyphs. Nothing is stubbed but the canvas — and the canvas is a
 * recorder, so an assertion here is a statement about pixels rather
 * than about a call into the scene.
 *
 * Baked canvases are identified by the paint they received: the test
 * bakes every readout the fight could plausibly show through the same
 * bakeSprite the provider uses and matches the recorded fill calls. So
 * the figures asserted on are the figures a player would read.
 *
 * The last test is the one that matters most: every figure floated over
 * a body is checked against the combat log's own account of the same
 * blow. There is one number, shown twice — if the popups ever grew
 * bookkeeping of their own, the two would drift and this would fail.
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

const paintOf = new Map<object, string[]>();
/** Readouts drawn onto a scene canvas since the list was cleared. */
let drawn: string[] = [];
let clock = 0;
let frameCallback: FrameRequestCallback | null = null;
let pictures = new Map<string, string>();

function signature(ops: readonly string[]): string {
  return ops.join(";");
}

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

/** Every figure and word a fight in this arena could plausibly float. */
function candidateReadouts(): Array<{ text: string; kind: PopupKind }> {
  const readouts: Array<{ text: string; kind: PopupKind }> = [];
  for (const kind of ["damage", "critical", "reduced"] as const) {
    for (let damage = 1; damage <= 60; damage++) {
      readouts.push({ text: `-${damage}`, kind });
    }
  }
  for (let amount = 1; amount <= 40; amount++) {
    readouts.push({ text: `+${amount}`, kind: "heal" });
  }
  readouts.push({ text: "MISS", kind: "miss" });
  readouts.push({ text: "NO ESCAPE", kind: "miss" });
  for (const family of STATUS_FAMILY_IDS) {
    readouts.push({ text: statusPopupLabel(family, "gain"), kind: "status" });
    readouts.push({
      text: statusPopupLabel(family, "loss"),
      kind: "status-out",
    });
  }
  return readouts;
}

/** Baked the way the provider bakes them, keyed by the paint they make. */
function knownPictures(): Map<string, string> {
  const known = new Map<string, string>();
  for (const { text, kind } of candidateReadouts()) {
    const sprite = bakeSprite(popupTextGrid(text, kind), 0, 0);
    known.set(signature(paintOf.get(sprite.image) ?? []), `${kind}:${text}`);
  }
  return known;
}

/** Which known readouts the fight has drawn since the list was cleared. */
function drawnReadouts(): string[] {
  const found: string[] = [];
  for (const sig of drawn) {
    const id = pictures.get(sig);
    if (id !== undefined && !found.includes(id)) found.push(id);
  }
  return found;
}

const kindsDrawn = (): Set<string> =>
  new Set(drawnReadouts().map((id) => id.split(":")[0] ?? ""));

/**
 * Run the scene's frame loop over a stretch of the scene clock. What
 * was drawn accumulates until a test clears it, so a readout that came
 * and went several turns ago is still counted as having been shown.
 */
function play(ms: number, stepMs = 20): void {
  for (let t = 0; t <= ms; t += stepMs) {
    clock += stepMs;
    frameCallback?.(clock);
  }
}

function clearDrawn(): void {
  drawn = [];
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

/** A fighter who knows every ability and carries something to heal with. */
function fighterState(seed: number): GameState {
  const allocation = baseStats();
  allocation.body += 6;
  allocation.reflexes += 5;
  allocation.tech += 4;
  const state = createNewGame({
    character: fixtureCharacter({ allocation }),
    seed,
  });
  let inventory = addItem(state.inventory, "cyb-myomer-arms", 1);
  inventory = addItem(inventory, "con-trauma-patch", 3);
  const loadout = installEnhancement(state.player, inventory, "cyb-myomer-arms");
  return {
    ...state,
    player: {
      ...loadout.character,
      advancement: { pointsSpent: 0, abilityIds: abilities.map((a) => a.id) },
    },
    inventory: loadout.inventory,
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
 * Close and swing; false once there is nothing left to swing at (the
 * fight is over, or the player cannot reach anybody).
 */
function attackOnce(): boolean {
  for (let guard = 0; guard < 40; guard++) {
    const attack = buttonByText("Attack");
    if (attack && !attack.disabled) {
      click("Attack");
      const target = document.querySelector<HTMLButtonElement>(
        ".nf-combat-selection .nf-choice",
      );
      if (target) {
        target.click();
        return true;
      }
      pressKey("Escape");
    }
    const endTurn = buttonByText("End Turn");
    if (endTurn?.disabled !== false) return false;
    if (!stepToward()) endTurn.click();
  }
  return false;
}

/** The same, for tests that have nothing to say without a blow. */
function mustAttack(): void {
  if (!attackOnce()) throw new Error("could not throw a blow");
}

/** Cast an ability the way a player does; walks in if it needs reach. */
function castAbility(name: string): void {
  for (let guard = 0; guard < 40; guard++) {
    const ability = buttonByText("Ability");
    if (ability && !ability.disabled) {
      click("Ability");
      const option = buttonByText(name);
      if (option && !option.disabled) {
        option.click();
        const target = document.querySelector<HTMLButtonElement>(
          ".nf-combat-selection .nf-choice",
        );
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
      session: createSession(fighterState(seed)),
      encounterId: ENCOUNTER_ID,
      resumeNodeId: null,
      enemyDelayMs: 0,
    }),
  );
}

/** The player's HP and whole frame, off the status line's readout. */
function playerHp(): { hp: number; maxHp: number } {
  const match = /HP (\d+)\/(\d+)/.exec(statusLine());
  return { hp: Number(match?.[1] ?? 0), maxHp: Number(match?.[2] ?? 0) };
}

describe("what a fight floats over the bodies in it", () => {
  it("puts a figure on a blow that lands", () => {
    mountFight();
    mustAttack();
    play(1200);
    expect(logText()).toMatch(/hits .* for \d+ damage/);
    const figures = drawnReadouts().filter((id) =>
      ["damage", "critical", "reduced"].includes(id.split(":")[0] ?? ""),
    );
    expect(figures.length, "the blow shows its figure").toBeGreaterThan(0);
  });

  it("says so out loud when a swing goes wide", () => {
    mountFight();
    // Swing until the dice give up a miss; the scouts dodge often
    // enough that a handful of turns finds one.
    for (let attempt = 0; attempt < 16; attempt++) {
      if (logText().includes("misses")) break;
      if (!attackOnce()) break;
      play(1200);
    }
    expect(logText(), "the fight recorded a miss").toContain("misses");
    expect(drawnReadouts(), "and the arena showed it").toContain("miss:MISS");
  });

  it("floats a heal in its own channel when HP comes back", () => {
    mountFight();
    // Trade blows until something has been taken off the bar: a patch
    // at full HP heals nothing, and a popup would be reporting nothing.
    for (let guard = 0; guard < 24; guard++) {
      const { hp, maxHp } = playerHp();
      if (hp < maxHp && buttonByText("Item")?.disabled === false) break;
      if (buttonByText("Attack")?.disabled === false) {
        mustAttack();
      } else {
        click("End Turn");
      }
      play(200);
    }
    clearDrawn();
    click("Item");
    click("Trauma Patch");
    play(1200);
    expect(logText()).toContain("recovers");
    expect(kindsDrawn()).toContain("heal");
  });

  it("announces a condition landing and lifting", () => {
    mountFight();
    castAbility("Bulwark Surge");
    play(1200);
    expect(drawnReadouts()).toContain(
      `status:${statusPopupLabel("guarded", "gain")}`,
    );
    // A couple of turns of plating, then it lifts — and says so, colder.
    for (let turn = 0; turn < 8; turn++) {
      if (buttonByText("End Turn")?.disabled !== false) break;
      click("End Turn");
      play(200);
    }
    expect(drawnReadouts()).toContain(
      `status-out:${statusPopupLabel("guarded", "loss")}`,
    );
  });

  it("announces a stun over the body it landed on", () => {
    mountFight();
    castAbility("Stun Strike");
    play(1400);
    expect(logText()).toContain("Stun Strike");
    expect(drawnReadouts()).toContain(
      `status:${statusPopupLabel("stunned", "gain")}`,
    );
  });

  it("shows the log's own figures, and never one of its own", () => {
    mountFight();
    // A long enough exchange to produce hits, misses, and conditions.
    for (let round = 0; round < 10; round++) {
      if (!attackOnce()) break;
      play(1400);
    }
    const log = logText();
    const seen = drawnReadouts();
    expect(seen.length, "the fight floated something").toBeGreaterThan(0);
    for (const id of seen) {
      const [kind = "", text = ""] = id.split(":");
      expect(POPUP_KINDS, id).toContain(kind as PopupKind);
      if (kind === "heal") {
        expect(log, id).toContain(`recovers ${text.slice(1)} HP`);
      } else if (text.startsWith("-")) {
        // The figure over the body is the figure in the log, exactly:
        // one number, said twice.
        expect(log, id).toContain(`${text.slice(1)} damage`);
      } else if (text === "MISS") {
        expect(log, id).toContain("misses");
      }
    }
  });
});
