// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TRANSITION_CUT,
  TRANSITION_TIMING,
  transitionDurationMs,
  transitionSwapMs,
} from "../iso/transition";
import { ARRIVAL_KICKER, runMapTransition } from "./mapTransition";

/**
 * The transition driver under fake timers: what matters is the order
 * the beats fire in — door before cover, cover before swap, name only
 * while covered — and that nothing is left on the page afterwards.
 */

function overlay(): HTMLElement | null {
  return document.querySelector(".nf-transition");
}

function card(): HTMLElement | null {
  return document.querySelector(".nf-transition-card");
}

function coverOpacity(): string {
  const cover = document.querySelector(".nf-transition-cover");
  return (cover as HTMLElement | null)?.style.opacity ?? "";
}

function nameShown(): boolean {
  return card()?.classList.contains("nf-transition-visible") === true;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("map transition", () => {
  it("opens the door, covers, swaps, names the destination, then reveals", () => {
    const log: string[] = [];
    const handle = runMapTransition({
      destinationName: "The Flooded Quays",
      openDoor: () => {
        log.push("door");
        return true;
      },
      onSwap: () => log.push("swap"),
      onDone: () => log.push("done"),
    });

    // The door is asked to play before anything covers the screen.
    expect(log).toEqual(["door"]);
    expect(handle.timing).toEqual(TRANSITION_TIMING);
    expect(overlay()).not.toBeNull();
    expect(coverOpacity()).toBe("0");
    expect(nameShown()).toBe(false);

    // Through the door beat the screen is still perfectly clear.
    vi.advanceTimersByTime(handle.timing.doorMs - 1);
    expect(coverOpacity()).toBe("0");
    expect(log).toEqual(["door"]);

    // Cover starts once the door is open.
    vi.advanceTimersByTime(1);
    expect(coverOpacity()).toBe("1");
    expect(log).toEqual(["door"]);

    // The map is swapped only once the cover is complete.
    vi.advanceTimersByTime(transitionSwapMs(handle.timing) - handle.timing.doorMs);
    expect(log).toEqual(["door", "swap"]);
    expect(nameShown()).toBe(true);
    expect(card()?.textContent).toContain("The Flooded Quays");
    expect(card()?.textContent).toContain(ARRIVAL_KICKER);

    // The name clears and the new map fades up.
    vi.advanceTimersByTime(handle.timing.holdMs);
    expect(nameShown()).toBe(false);
    expect(coverOpacity()).toBe("0");
    expect(log).toEqual(["door", "swap"]);

    // Nothing is left behind.
    vi.advanceTimersByTime(handle.timing.revealMs);
    expect(log).toEqual(["door", "swap", "done"]);
    expect(overlay()).toBeNull();
  });

  it("skips the door beat when nothing openable led here", () => {
    let swapped = false;
    const handle = runMapTransition({
      destinationName: "Cinder Row Plaza",
      openDoor: () => false,
      onSwap: () => (swapped = true),
    });
    expect(handle.timing.doorMs).toBe(0);

    // The fade starts immediately instead of pausing on a door.
    vi.advanceTimersByTime(0);
    expect(coverOpacity()).toBe("1");
    expect(swapped).toBe(false);

    // ...and the swap lands a cover's length later, not a door's.
    vi.advanceTimersByTime(handle.timing.coverMs - 1);
    expect(swapped).toBe(false);
    vi.advanceTimersByTime(1);
    expect(swapped).toBe(true);
  });

  it("reduced motion cuts straight over, with the name still shown", () => {
    const log: string[] = [];
    const handle = runMapTransition({
      destinationName: "Auric Spire — Crown Concourse",
      reducedMotion: true,
      openDoor: () => {
        log.push("door");
        return true;
      },
      onSwap: () => log.push("swap"),
      onDone: () => log.push("done"),
    });
    expect(handle.timing).toEqual(TRANSITION_CUT);
    // A cut darkens nothing and swallows no clicks.
    expect(overlay()?.style.pointerEvents).toBe("none");

    vi.advanceTimersByTime(0);
    expect(log).toEqual(["door", "swap"]);
    expect(coverOpacity()).toBe("0");
    expect(nameShown()).toBe(true);
    expect(card()?.textContent).toContain("Auric Spire");

    vi.advanceTimersByTime(transitionDurationMs(handle.timing));
    expect(log).toEqual(["door", "swap", "done"]);
    expect(overlay()).toBeNull();
  });

  it("blocks input while the screen is actually covered", () => {
    runMapTransition({ destinationName: "Greywater Steps", onSwap: () => {} });
    expect(overlay()?.style.pointerEvents).toBe("auto");
  });

  it("cancelling before the swap leaves the map alone", () => {
    const log: string[] = [];
    const handle = runMapTransition({
      destinationName: "Greywater Steps",
      onSwap: () => log.push("swap"),
      onDone: () => log.push("done"),
    });
    handle.cancel();
    expect(overlay()).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(log).toEqual([]);
  });

  it("cancelling after the swap lets the reveal finish", () => {
    const log: string[] = [];
    const handle = runMapTransition({
      destinationName: "Greywater Steps",
      onSwap: () => log.push("swap"),
      onDone: () => log.push("done"),
    });
    vi.advanceTimersByTime(transitionSwapMs(handle.timing));
    expect(log).toEqual(["swap"]);
    // The screen it was covering is gone by now — cancelling must not
    // strand the page under a black cover.
    handle.cancel();
    expect(overlay()).not.toBeNull();
    vi.advanceTimersByTime(transitionDurationMs(handle.timing));
    expect(log).toEqual(["swap", "done"]);
    expect(overlay()).toBeNull();
  });

  it("mounts outside the screen root so it survives the swap", () => {
    const root = document.createElement("div");
    document.body.append(root);
    runMapTransition({
      destinationName: "Meridian Exchange — Ventworks",
      host: document.body,
      onSwap: () => root.replaceChildren(),
    });
    expect(overlay()?.parentElement).toBe(document.body);
  });
});
