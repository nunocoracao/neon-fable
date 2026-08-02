// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { fixtureCharacter } from "../character/testSupport";
import { barks, type Bark } from "../data/barks";
import type { SceneSpeaker, SceneSpeakerFrame } from "../iso";
import { BARK_LIFE_MS } from "../narrative/barks";
import { settings } from "../settings";
import { createNewGame, type GameState } from "../state";
import { createBarkLayer, type BarkLayerHandle } from "./barkLayer";

/**
 * The chip layer. Nothing here decides who talks — that is the
 * scheduler's job and is tested there. What is pinned here is the
 * layer's side of the bargain: chips follow the head they belong to,
 * they are decoration in the markup (aria-hidden, inert, unfocusable),
 * and both the setting and an open panel take the whole street down.
 */

const state: GameState = createNewGame({
  character: fixtureCharacter({}),
  seed: 3,
});

function speaker(overrides: Partial<SceneSpeaker> = {}): SceneSpeaker {
  return {
    id: "ped-1",
    kind: "pedestrian",
    refId: null,
    zoneId: "market-row",
    distance: 2,
    anchorX: 420,
    anchorY: 240,
    onScreen: true,
    ...overrides,
  };
}

function frame(overrides: Partial<SceneSpeakerFrame> = {}): SceneSpeakerFrame {
  return {
    timeMs: 0,
    mapId: "cinder-plaza",
    weather: "clear",
    dayPhase: "dusk",
    speakers: [speaker()],
    lingerMs: 10_000,
    ...overrides,
  };
}

function layer(): BarkLayerHandle {
  return createBarkLayer({ state: () => state, seed: "test-street" });
}

function chipTexts(handle: BarkLayerHandle): string[] {
  return [...handle.el.querySelectorAll(".nf-bark-chip")].map(
    (chip) => chip.textContent ?? "",
  );
}

afterEach(() => {
  settings.update({ barks: true, motion: "full" });
});

describe("bark layer", () => {
  it("is decoration: aria-hidden, inert, and holding nothing focusable", () => {
    const handle = layer();
    expect(handle.el.getAttribute("aria-hidden")).toBe("true");
    expect(handle.el.className).toBe("nf-bark-layer");

    handle.update(frame());
    expect(handle.chips()).toBeGreaterThan(0);
    // Nothing a keyboard or a screen reader can reach, and nothing that
    // can be clicked — the click belongs to whoever is under the chip.
    expect(handle.el.querySelector("button, a, input, [tabindex]")).toBeNull();
    for (const chip of handle.el.querySelectorAll(".nf-bark-chip")) {
      expect(chip.getAttribute("aria-hidden")).toBeNull();
      expect((chip as HTMLElement).onclick).toBeNull();
    }
    handle.destroy();
  });

  it("puts a chip where the speaker's head is, and moves it with them", () => {
    const handle = layer();
    handle.update(frame());
    const chip = handle.el.querySelector<HTMLElement>(".nf-bark-chip");
    expect(chip).not.toBeNull();
    expect(chip!.style.left).toBe("420px");
    expect(chip!.style.top).toBe("240px");
    // Born on this frame, so it is still fading in.
    expect(Number(chip!.style.opacity)).toBe(0);

    handle.update(
      frame({ timeMs: 400, speakers: [speaker({ anchorX: 300, anchorY: 120 })] }),
    );
    expect(chip!.style.left).toBe("300px");
    expect(chip!.style.top).toBe("120px");
    expect(Number(chip!.style.opacity)).toBe(1);
    handle.destroy();
  });

  it("hides a chip whose speaker has walked out of frame", () => {
    const handle = layer();
    handle.update(frame());
    const chip = handle.el.querySelector<HTMLElement>(".nf-bark-chip")!;
    handle.update(
      frame({ timeMs: 200, speakers: [speaker({ onScreen: false })] }),
    );
    expect(chip.style.opacity).toBe("0");
    handle.destroy();
  });

  it("takes a chip down once its life is over", () => {
    const handle = layer();
    handle.update(frame());
    expect(handle.chips()).toBe(1);
    handle.update(frame({ timeMs: BARK_LIFE_MS }));
    expect(handle.chips()).toBe(0);
    handle.destroy();
  });

  it("says nothing at all with the setting off", () => {
    settings.update({ barks: false });
    const handle = layer();
    for (const timeMs of [0, 3000, 6000, 9000]) handle.update(frame({ timeMs }));
    expect(handle.chips()).toBe(0);
    expect(chipTexts(handle)).toEqual([]);

    // And turning it back on starts the street up again.
    settings.update({ barks: true });
    handle.update(frame({ timeMs: 12_000 }));
    expect(handle.chips()).toBe(1);
    handle.destroy();
  });

  it("clears the street while a panel is open, and resumes after", () => {
    const handle = layer();
    handle.update(frame());
    expect(handle.chips()).toBe(1);

    handle.setPaused(true);
    expect(handle.chips()).toBe(0);
    handle.update(frame({ timeMs: 4000 }));
    expect(handle.chips()).toBe(0);

    handle.setPaused(false);
    handle.update(frame({ timeMs: 30_000 }));
    expect(handle.chips()).toBe(1);
    handle.destroy();
  });

  it("only offers a line to somebody actually in frame", () => {
    const handle = layer();
    handle.update(frame({ speakers: [speaker({ onScreen: false })] }));
    expect(handle.chips()).toBe(0);
    handle.destroy();
  });

  it("draws real catalog lines, not placeholders", () => {
    const handle = layer();
    handle.update(frame());
    const [text] = chipTexts(handle);
    expect(text).toBeTruthy();
    // Whatever the draw picked, it is a line somebody wrote.
    expect(barks.map((bark: Bark) => bark.text)).toContain(text);
    handle.destroy();
  });

  it("destroys cleanly, taking its element and chips with it", () => {
    const host = document.createElement("div");
    const handle = layer();
    host.append(handle.el);
    handle.update(frame());
    handle.destroy();
    expect(host.querySelector(".nf-bark-layer")).toBeNull();
    expect(handle.chips()).toBe(0);
  });
});
