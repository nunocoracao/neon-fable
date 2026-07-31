// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInterlude } from "../data";
import { composeInterlude } from "../narrative";
import { createNewGame, type GameState } from "../state";
import type { FlagValue } from "../state/flags";
import { INTERLUDE_BEAT_MS } from "./interludeModel";
import { createInterludeOverlay } from "./interludeOverlay";
import type { OverlayHandle } from "./overlay";

/**
 * The vignette as DOM: beats arriving on the clock, any click or Enter
 * catching them up, the next one closing, and reduced motion showing
 * the whole recap at once. Which beats these are is settled in the
 * narrative layer's tests — here only the reveal is under test.
 */

function composed(flags: Record<string, FlagValue>) {
  const base = createNewGame({ playerName: "Vex", seed: 2 });
  const state: GameState = { ...base, flags };
  return composeInterlude(state, getInterlude("act1-act2")!);
}

let closed = 0;
/** Mounted overlays, torn down between tests — they listen on window. */
const live: OverlayHandle[] = [];

function mount(reducedMotion = false): OverlayHandle {
  const handle = createInterludeOverlay({
    interlude: composed({
      "act1-complete": true,
      "act1-outcome": "court",
      "court-oath": true,
      "wanted-by-auric": true,
    }),
    reducedMotion,
    onClose: () => {
      closed += 1;
    },
  });
  document.body.append(handle.el);
  live.push(handle);
  return handle;
}

function beats(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-interlude-beat")];
}

function shown(): number {
  return beats().filter((beat) =>
    beat.classList.contains("nf-interlude-beat-shown"),
  ).length;
}

function button(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(".nf-interlude .nf-button");
  if (!el) throw new Error("no interlude button");
  return el;
}

beforeEach(() => {
  closed = 0;
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  for (const handle of live.splice(0)) handle.destroy();
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("interlude overlay", () => {
  it("names the boundary and the district it ended in", () => {
    mount();
    expect(document.querySelector(".nf-chapter-end-kicker")?.textContent).toBe(
      "Interlude — After the Flood Night",
    );
    expect(document.querySelector("h2")?.textContent).toBe(
      "What the Night Set Moving",
    );
    expect(document.querySelector(".nf-interlude-place")?.textContent).toBe(
      "Greywater Steps",
    );
    expect(
      document.querySelector(".nf-interlude-backdrop")?.className,
    ).toContain("nf-interlude-tone-cyan");
  });

  it("fades the beats in one at a time", () => {
    mount();
    const total = beats().length;
    expect(total).toBeGreaterThan(1);
    expect(shown()).toBe(1);
    vi.advanceTimersByTime(INTERLUDE_BEAT_MS);
    expect(shown()).toBe(2);
    vi.advanceTimersByTime(INTERLUDE_BEAT_MS * total);
    expect(shown()).toBe(total);
  });

  it("a click shows the rest instantly, and the next one leaves", () => {
    const handle = mount();
    handle.el.click();
    expect(shown()).toBe(beats().length);
    expect(closed).toBe(0);
    expect(button().textContent).toBe("Continue");
    handle.el.click();
    expect(closed).toBe(1);
  });

  it("Enter does the same thing as a click", () => {
    mount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(shown()).toBe(beats().length);
    expect(closed).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(closed).toBe(1);
  });

  it("the button skips and then continues, like everything else", () => {
    mount();
    expect(button().textContent).toBe("Skip");
    button().click();
    expect(shown()).toBe(beats().length);
    expect(closed).toBe(0);
    button().click();
    expect(closed).toBe(1);
  });

  it("shows the whole recap at once under reduced motion", () => {
    mount(true);
    expect(shown()).toBe(beats().length);
    expect(button().textContent).toBe("Continue");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(closed).toBe(1);
  });

  it("stops listening once destroyed", () => {
    const handle = mount();
    handle.destroy();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    vi.advanceTimersByTime(INTERLUDE_BEAT_MS * 10);
    expect(closed).toBe(0);
    expect(document.querySelector(".nf-interlude")).toBeNull();
  });
});
