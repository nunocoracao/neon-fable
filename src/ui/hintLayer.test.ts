// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getHint } from "../data/hints";
import { COMBAT_HINT_BUDGET, resetHintFlags } from "../narrative/hints";
import { DEFAULT_SETTINGS, settings } from "../settings";
import type { FlagMap } from "../state/flags";
import { createHintLayer, type HintLayerHandle } from "./hintLayer";

/**
 * The chip as a player meets it: one at a time, gone on a click, never
 * twice, and silent when the switch is off.
 *
 * The layer is deliberately given a mutable flag map and a writer, the
 * same shape the screens hand it, so "once per run" is tested through
 * the thing that actually makes it true — the save — rather than
 * through a counter inside the layer.
 */

let layer: HintLayerHandle | null = null;
let flags: FlagMap = {};

function mount(limit?: number): HintLayerHandle {
  layer?.destroy();
  layer = createHintLayer({
    flags: () => flags,
    onSeen: (next) => {
      flags = next;
    },
    ...(limit === undefined ? {} : { limit }),
  });
  document.body.append(layer.el);
  return layer;
}

function chips(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".nf-hint-chip")];
}

function chipText(): string {
  return (chips()[0]?.textContent ?? "").trim();
}

function dismissButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(".nf-hint-dismiss");
  if (!button) throw new Error("no dismiss button — nothing is on screen");
  return button;
}

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  settings.update({ ...DEFAULT_SETTINGS });
  flags = {};
});

afterEach(() => {
  layer?.destroy();
  layer = null;
});

describe("triggers", () => {
  it("puts up the hint the trigger owns, and records it in the run", () => {
    mount().cue("explore");
    expect(chips()).toHaveLength(1);
    expect(chipText()).toContain(getHint("hint-move")!.title);
    expect(flags["hint:hint-move"]).toBe(true);
  });

  it("teaches each system on its own trigger", () => {
    const handle = mount();
    handle.cue("interact");
    expect(handle.active()).toBe("hint-interact");
    handle.dismiss();
    handle.cue("vendor");
    expect(handle.active()).toBe("hint-vendor");
    handle.dismiss();
    handle.cue("breach");
    expect(handle.active()).toBe("hint-breach");
  });

  it("never stacks: a second trigger waits for the first to be dismissed", () => {
    const handle = mount();
    handle.cue("explore");
    handle.cue("interact");
    // The chip already up keeps the screen; the newcomer waits.
    expect(chips()).toHaveLength(1);
    expect(handle.active()).toBe("hint-move");

    handle.dismiss();
    expect(chips()).toHaveLength(0);
    // Nothing promotes itself: the next cue is what moves the queue on.
    handle.cue("interact");
    expect(chips()).toHaveLength(1);
    expect(handle.active()).toBe("hint-interact");
  });

  it("shows a hint once per run, across screens", () => {
    mount().cue("explore");
    layer!.dismiss();
    // A new scene — a fight, the next district — with the same run.
    mount().cue("explore");
    expect(chips()).toHaveLength(0);
    expect(layer!.active()).toBeNull();
  });

  it("re-cueing the same trigger every frame changes nothing", () => {
    const handle = mount();
    for (let i = 0; i < 20; i++) handle.cue("explore");
    expect(chips()).toHaveLength(1);
    expect(handle.active()).toBe("hint-move");
  });
});

describe("dismissing", () => {
  it("goes on the click of its own button, with nothing to confirm", () => {
    mount().cue("injury");
    dismissButton().click();
    expect(chips()).toHaveLength(0);
    expect(layer!.active()).toBeNull();
  });

  it("stays dismissed — a hint already shown does not come back", () => {
    const handle = mount();
    handle.cue("injury");
    dismissButton().click();
    handle.cue("injury");
    expect(chips()).toHaveLength(0);
  });

  it("names the hint it would dismiss, for anybody who cannot see it", () => {
    mount().cue("static");
    expect(dismissButton().getAttribute("aria-label")).toContain(
      getHint("hint-static")!.title,
    );
  });
});

describe("pausing", () => {
  it("clears the chip while a panel is open, and cues nothing behind it", () => {
    const handle = mount();
    handle.cue("explore");
    handle.setPaused(true);
    expect(chips()).toHaveLength(0);
    handle.cue("interact");
    expect(chips()).toHaveLength(0);
  });

  it("hands the covered chip back instead of spending it", () => {
    const handle = mount();
    handle.cue("explore");
    handle.setPaused(true);
    // Covered before it could be read, so the run has not been told —
    // which is what stops a vendor hint being burned behind the
    // counter's own panel.
    expect(flags["hint:hint-move"]).toBeUndefined();

    handle.setPaused(false);
    handle.cue("explore");
    expect(handle.active()).toBe("hint-move");
    expect(flags["hint:hint-move"]).toBe(true);
  });

  it("a hint cued while a panel opens over it survives to be read", () => {
    const handle = mount();
    // The counter's own hint is cued as the counter opens.
    handle.cue("vendor");
    handle.setPaused(true);
    expect(chips()).toHaveLength(0);

    handle.setPaused(false);
    handle.cue("explore");
    // Priority still decides, and the vendor line is not lost.
    handle.dismiss();
    handle.cue("vendor");
    expect(handle.active()).toBe("hint-vendor");
  });
});

describe("the hints setting", () => {
  it("suppresses every chip while it is off", () => {
    settings.update({ hints: false });
    const handle = mount();
    handle.cue("explore");
    handle.cue("combat-turn");
    expect(chips()).toHaveLength(0);
    expect(handle.active()).toBeNull();
  });

  it("forgets nothing while off, so turning it back on carries on", () => {
    settings.update({ hints: false });
    mount().cue("explore");
    // Nothing was shown, so nothing was recorded.
    expect(flags["hint:hint-move"]).toBeUndefined();

    settings.update({ hints: true });
    mount().cue("explore");
    expect(chips()).toHaveLength(1);
    expect(flags["hint:hint-move"]).toBe(true);
  });

  it("switching off mid-run keeps what has already been shown shown", () => {
    mount().cue("explore");
    layer!.dismiss();
    settings.update({ hints: false });
    settings.update({ hints: true });
    mount().cue("explore");
    expect(chips()).toHaveLength(0);
  });
});

describe("resetting", () => {
  it("replays the run's hints from the next street on", () => {
    mount().cue("explore");
    layer!.dismiss();
    mount().cue("explore");
    expect(chips()).toHaveLength(0);

    flags = resetHintFlags(flags);
    mount().cue("explore");
    expect(chips()).toHaveLength(1);
    expect(layer!.active()).toBe("hint-move");
  });
});

describe("the action-bar tour", () => {
  it("spends one fight's budget and leaves the rest for the next", () => {
    const first = mount(COMBAT_HINT_BUDGET);
    const shown: string[] = [];
    for (let i = 0; i < 6; i++) {
      first.cue("combat-turn");
      const active = first.active();
      if (active && !shown.includes(active)) shown.push(active);
      first.dismiss();
    }
    expect(shown).toHaveLength(COMBAT_HINT_BUDGET);
    expect(shown[0]).toBe("hint-combat-attack");

    // The next fight picks the tour up where it stopped.
    const second = mount(COMBAT_HINT_BUDGET);
    second.cue("combat-turn");
    expect(second.active()).toBe("hint-combat-end");
    expect(shown).not.toContain("hint-combat-end");
  });

  it("leaves the map unrationed", () => {
    const handle = mount();
    const shown: string[] = [];
    for (const trigger of ["explore", "interact", "vendor", "breach"] as const) {
      handle.cue(trigger);
      const active = handle.active();
      if (active) shown.push(active);
      handle.dismiss();
    }
    expect(shown).toHaveLength(4);
  });
});

describe("mounting", () => {
  it("is a polite live region, so a chip is read but never interrupts", () => {
    const handle = mount();
    expect(handle.el.getAttribute("role")).toBe("status");
    expect(handle.el.getAttribute("aria-live")).toBe("polite");
  });

  it("takes its chip with it when the screen goes", () => {
    const handle = mount();
    handle.cue("explore");
    handle.destroy();
    expect(chips()).toHaveLength(0);
    expect(document.querySelector(".nf-hint-layer")).toBeNull();
    layer = null;
  });
});
