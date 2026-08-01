// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { audio, faderGain, formatFader } from "../audio";
import { DEFAULT_MIXER } from "../audio/mixer";
import { MIX_BUSES, MIX_BUS_IDS, type MixBusId } from "../data/mixBuses";
import { DEFAULT_SETTINGS, settings } from "../settings";
import { createSettingsOverlay } from "./settingsScreen";
import type { OverlayHandle } from "./overlay";

/**
 * The mixer section of the settings panel: four strips, live, and a
 * ducking switch.
 *
 * What is under test is the wiring — that a fader move reaches the bus
 * and the store without a restart, that a mute anywhere is reflected
 * everywhere it matters, and that the whole thing is operable and
 * legible without a mouse. The sound itself is the audio module's
 * problem and is pinned there.
 */

let overlay: OverlayHandle | null = null;

function open(): void {
  overlay = createSettingsOverlay({ onClose: () => undefined });
  document.body.append(overlay.el);
}

function slider(bus: MixBusId): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(
    `input[type="range"][data-bus="${bus}"]`,
  );
  if (!found) throw new Error(`no fader for ${bus}`);
  return found;
}

function muteButton(bus: MixBusId): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(
    `button[data-mute="${bus}"]`,
  );
  if (!found) throw new Error(`no mute for ${bus}`);
  return found;
}

function toneButton(bus: MixBusId): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(
    `button[data-tone="${bus}"]`,
  );
  if (!found) throw new Error(`no test tone for ${bus}`);
  return found;
}

/** Drags a fader the way a pointer does: set the value, fire input. */
function drag(bus: MixBusId, percent: number): void {
  const control = slider(bus);
  control.value = String(percent);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}

function readout(bus: MixBusId): string {
  const row = slider(bus).closest(".nf-setting-row");
  return row?.querySelector(".nf-mixer-readout")?.textContent ?? "";
}

beforeEach(() => {
  settings.update({ ...DEFAULT_SETTINGS, mixer: DEFAULT_MIXER });
});

afterEach(() => {
  overlay?.destroy();
  overlay = null;
  document.body.replaceChildren();
  settings.update({ ...DEFAULT_SETTINGS, mixer: DEFAULT_MIXER });
});

describe("the mixer strips", () => {
  it("puts a fader, a mute, and a test tone on every bus", () => {
    open();
    for (const bus of MIX_BUSES) {
      expect(slider(bus.id), bus.id).toBeDefined();
      expect(muteButton(bus.id), bus.id).toBeDefined();
      expect(toneButton(bus.id), bus.id).toBeDefined();
    }
    expect(
      document.querySelectorAll('input[type="range"][data-bus]'),
    ).toHaveLength(MIX_BUS_IDS.length);
  });

  it("opens showing what the mixer is actually set to", () => {
    settings.update({
      mixer: { ...DEFAULT_MIXER, volumes: { ...DEFAULT_MIXER.volumes, ui: 0.4 } },
    });
    open();
    expect(slider("ui").value).toBe("40");
    expect(readout("ui")).toBe(formatFader(0.4));
  });

  it("applies a fader move live, with no restart and no confirmation", () => {
    open();
    drag("music", 25);
    expect(audio.getMixer().volumes.music).toBeCloseTo(0.25, 9);
    expect(settings.get().mixer.volumes.music).toBeCloseTo(0.25, 9);
    expect(readout("music")).toBe(formatFader(0.25));
  });

  it("persists a fader move through the settings store", () => {
    open();
    drag("sfx", 60);
    overlay?.destroy();
    overlay = null;
    document.body.replaceChildren();
    // Reopened from the store, not from anything the old panel held.
    open();
    expect(slider("sfx").value).toBe("60");
  });

  it("mutes and unmutes one bus, saying so without color", () => {
    open();
    const mute = muteButton("ui");
    expect(mute.getAttribute("aria-pressed")).toBe("false");

    mute.click();
    expect(audio.getMixer().mutes.ui).toBe(true);
    expect(mute.getAttribute("aria-pressed")).toBe("true");
    expect(mute.textContent).toBe("Unmute");
    // And only that bus.
    expect(muteButton("sfx").getAttribute("aria-pressed")).toBe("false");

    mute.click();
    expect(audio.getMixer().mutes.ui).toBe(false);
    expect(mute.textContent).toBe("Mute");
  });

  it("lets the master mute speak for the strips under it", () => {
    open();
    muteButton("master").click();
    expect(audio.getMixer().mutes.master).toBe(true);
    // The other strips are not themselves muted — their own buttons say
    // so honestly — but nothing on them can be heard, and their test
    // tones stop offering to prove otherwise.
    for (const bus of MIX_BUSES) {
      if (bus.id === "master") continue;
      expect(muteButton(bus.id).getAttribute("aria-pressed"), bus.id).toBe(
        "false",
      );
      expect(toneButton(bus.id).disabled, bus.id).toBe(true);
    }
  });

  it("disables a test tone on a bus that has been faded to nothing", () => {
    open();
    expect(toneButton("music").disabled).toBe(false);
    drag("music", 0);
    expect(toneButton("music").disabled).toBe(true);
    expect(readout("music")).toBe("Off");
    drag("music", 50);
    expect(toneButton("music").disabled).toBe(false);
  });

  it("plays the test tone without changing anything", () => {
    open();
    const before = audio.getMixer();
    expect(() => toneButton("sfx").click()).not.toThrow();
    expect(audio.getMixer()).toEqual(before);
  });
});

describe("mixer accessibility", () => {
  it("uses native range inputs, so the keyboard already works", () => {
    // Arrows, Home/End and Page Up/Down come free with the element, and
    // installListNav deliberately leaves inputs alone (see ./focus.ts).
    open();
    for (const bus of MIX_BUSES) {
      const control = slider(bus.id);
      expect(control.type, bus.id).toBe("range");
      expect(control.min, bus.id).toBe("0");
      expect(control.max, bus.id).toBe("100");
      expect(control.step, bus.id).toBe("1");
      expect(control.disabled, bus.id).toBe(false);
    }
  });

  it("names every control for a player who cannot see the row", () => {
    open();
    for (const bus of MIX_BUSES) {
      expect(slider(bus.id).getAttribute("aria-label"), bus.id).toContain(
        bus.label,
      );
      expect(muteButton(bus.id).getAttribute("aria-label"), bus.id).toContain(
        bus.label,
      );
      expect(toneButton(bus.id).getAttribute("aria-label"), bus.id).toContain(
        bus.label,
      );
    }
  });

  it("speaks the level rather than a bare number", () => {
    open();
    drag("master", 75);
    // 75% of the travel is not 75% of the gain, and a fader that only
    // said "75" would be hiding the difference.
    expect(slider("master").getAttribute("aria-valuetext")).toBe(
      formatFader(0.75),
    );
    expect(faderGain(0.75)).not.toBeCloseTo(0.75, 2);
  });

  it("keeps every strip honest when another one moves", () => {
    open();
    drag("master", 0);
    for (const bus of MIX_BUSES) {
      if (bus.id === "master") continue;
      expect(toneButton(bus.id).disabled, bus.id).toBe(true);
    }
  });
});

describe("the ducking switch", () => {
  it("opens on whatever the mixer says, and writes both ways", () => {
    open();
    const row = [...document.querySelectorAll(".nf-setting-row")].find(
      (candidate) =>
        candidate.querySelector(".nf-setting-label")?.textContent ===
        "When you look away",
    );
    if (!row) throw new Error("no ducking row");
    const [quiet, keep] = [...row.querySelectorAll("button")];
    expect(quiet?.getAttribute("aria-pressed")).toBe("true");

    keep?.click();
    expect(audio.getMixer().duckOnBlur).toBe(false);
    expect(settings.get().mixer.duckOnBlur).toBe(false);
    expect(keep?.getAttribute("aria-pressed")).toBe("true");

    quiet?.click();
    expect(audio.getMixer().duckOnBlur).toBe(true);
  });
});
