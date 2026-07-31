import { audio, type VolumeChannel } from "../audio";
import {
  clampShakeScale,
  clampZoom,
  settings,
  SHAKE_SCALES,
  TEXT_SPEEDS,
  ZOOM_LEVELS,
  type ShakeScale,
  type TextSpeed,
} from "../settings";
import { focusFirst, installListNav } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Screen } from "./screen";

/**
 * The Settings panel: audio mixer (persisted by the audio bus), text
 * speed and reduced motion (persisted by the settings store), and the
 * keyboard controls reference. Built once, used two ways — as a full
 * screen from the main menu and as an in-game overlay from the pause
 * menu, so opening it mid-game never touches the session.
 */

const TEXT_SPEED_LABELS: Record<TextSpeed, string> = {
  instant: "Instant",
  fast: "Fast",
  normal: "Normal",
};

/** Combat shake amplitudes, said in words rather than multipliers. */
const SHAKE_SCALE_LABELS: Record<ShakeScale, string> = {
  0: "Off",
  0.5: "Light",
  1: "Standard",
  1.5: "Strong",
};

/** Keyboard reference shown in the Controls section. */
const CONTROLS: ReadonlyArray<[keys: string, what: string]> = [
  ["Arrows / Tab", "Move focus through menus, choices, and items"],
  ["Enter / Space", "Confirm the focused control"],
  ["Esc", "Back out of a panel · pause the game"],
  ["1–9", "Pick a dialogue choice by number"],
  ["I", "Open or close the inventory"],
  ["P", "Open or close advancement"],
  ["M", "Expand or collapse the minimap"],
  ["Arrows in combat", "Step across the grid while moving"],
  ["Tab in combat", "Cycle the action buttons"],
  ["Click / drag", "Move and interact · pan the camera"],
  ["Wheel / + −", "Zoom the camera while exploring"],
];

function settingRow(label: string, ...controls: HTMLElement[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "nf-setting-row";
  const name = document.createElement("span");
  name.className = "nf-setting-label";
  name.textContent = label;
  row.append(name, ...controls);
  return row;
}

function volumeRow(label: string, channel: VolumeChannel): HTMLElement {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.setAttribute("aria-label", label);
  slider.value = String(Math.round(audio.getMixer()[channel] * 100));
  slider.addEventListener("input", () => {
    audio.setVolume(channel, Number(slider.value) / 100);
  });
  // A sample blip on release so the new level is audible immediately.
  slider.addEventListener("change", () => audio.play("ui-confirm"));
  return settingRow(label, slider);
}

/**
 * A row of mutually exclusive small buttons; the active one carries
 * .nf-selected and aria-pressed so the state reads without color.
 */
function segmentedRow<T extends string>(
  label: string,
  options: ReadonlyArray<readonly [value: T, text: string]>,
  isSelected: (value: T) => boolean,
  onSelect: (value: T) => void,
): HTMLElement {
  const group = document.createElement("div");
  group.className = "nf-segmented";
  const sync = (): void => {
    for (const button of group.querySelectorAll<HTMLButtonElement>("button")) {
      const value = button.dataset.value as T;
      const selected = isSelected(value);
      button.classList.toggle("nf-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
  };
  for (const [value, text] of options) {
    const button = document.createElement("button");
    button.className = "nf-button nf-button-small";
    button.textContent = text;
    button.dataset.value = value;
    button.addEventListener("click", () => {
      onSelect(value);
      sync();
    });
    group.append(button);
  }
  sync();
  return settingRow(label, group);
}

function buildSettingsPanel(onClose: () => void): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "nf-panel nf-settings";

  const title = document.createElement("h2");
  title.textContent = "Settings";
  panel.append(title);

  const audioHeading = document.createElement("h3");
  audioHeading.textContent = "Audio";
  panel.append(
    audioHeading,
    volumeRow("Master volume", "master"),
    volumeRow("Sound effects", "sfx"),
    volumeRow("Music", "music"),
  );

  const mute = document.createElement("button");
  mute.className = "nf-button nf-button-small";
  const syncMute = (): void => {
    const muted = audio.getMixer().muted;
    mute.textContent = muted ? "Unmute" : "Mute";
    mute.setAttribute("aria-pressed", String(muted));
  };
  syncMute();
  mute.addEventListener("click", () => {
    audio.toggleMuted();
    syncMute();
  });
  panel.append(settingRow("All audio", mute));

  const textHeading = document.createElement("h3");
  textHeading.textContent = "Text";
  panel.append(
    textHeading,
    segmentedRow(
      "Text speed",
      TEXT_SPEEDS.map((speed) => [speed, TEXT_SPEED_LABELS[speed]] as const),
      (speed) => settings.get().textSpeed === speed,
      (speed) => settings.update({ textSpeed: speed }),
    ),
  );

  const displayHeading = document.createElement("h3");
  displayHeading.textContent = "Display";
  panel.append(
    displayHeading,
    segmentedRow(
      "Camera zoom",
      ZOOM_LEVELS.map((level) => [String(level), `${level}×`] as const),
      (value) => String(settings.get().zoom) === value,
      (value) => settings.update({ zoom: clampZoom(Number(value)) }),
    ),
    segmentedRow(
      "Neon glow",
      [
        ["on", "On"],
        ["off", "Off"],
      ] as const,
      (value) => (value === "on") === settings.get().glow,
      (value) => settings.update({ glow: value === "on" }),
    ),
  );
  const glowNote = document.createElement("p");
  glowNote.className = "nf-dim";
  glowNote.textContent =
    "Neon glow layers soft light from signage, screens, and streetlights " +
    "over the streets. Turn it off for a flatter, faster picture.";
  panel.append(glowNote);

  panel.append(
    segmentedRow(
      "Weather",
      [
        ["on", "On"],
        ["off", "Off"],
      ] as const,
      (value) => (value === "on") === settings.get().weather,
      (value) => settings.update({ weather: value === "on" }),
    ),
  );
  const weatherNote = document.createElement("p");
  weatherNote.className = "nf-dim";
  weatherNote.textContent =
    "Weather draws rain, puddles, and splashes on the districts that " +
    "have them. It never changes how the game plays — turn it off for a " +
    "clearer, cheaper picture. Reduced motion stills the rain on its own.";
  panel.append(weatherNote);

  panel.append(
    segmentedRow(
      "Minimap",
      [
        ["on", "Shown"],
        ["off", "Collapsed"],
      ] as const,
      (value) => (value === "on") === settings.get().minimap,
      (value) => settings.update({ minimap: value === "on" }),
    ),
  );
  const minimapNote = document.createElement("p");
  minimapNote.className = "nf-dim";
  minimapNote.textContent =
    "The minimap shows the whole district, where you stand and face, the " +
    "ways out, and who is worth walking to. Collapsed it leaves a tab in " +
    "the corner; M expands it again while exploring.";
  panel.append(minimapNote);

  panel.append(
    segmentedRow(
      "Street chatter",
      [
        ["on", "On"],
        ["off", "Off"],
      ] as const,
      (value) => (value === "on") === settings.get().barks,
      (value) => settings.update({ barks: value === "on" }),
    ),
  );
  const barkNote = document.createElement("p");
  barkNote.className = "nf-dim";
  barkNote.textContent =
    "Passers-by, the people standing on the map, and whoever is walking " +
    "with you say short unprompted lines over their heads. Nothing said " +
    "this way matters to the story — off keeps the streets quiet.";
  panel.append(barkNote);

  const motionHeading = document.createElement("h3");
  motionHeading.textContent = "Motion";
  panel.append(
    motionHeading,
    segmentedRow(
      "Screen motion",
      [
        ["full", "Full"],
        ["reduced", "Reduced"],
      ] as const,
      (value) => (value === "reduced") === settings.get().reducedMotion,
      (value) => settings.update({ reducedMotion: value === "reduced" }),
    ),
  );
  const motionNote = document.createElement("p");
  motionNote.className = "nf-dim";
  motionNote.textContent =
    "Reduced motion turns off screen shake, hit flashes, and ambient " +
    "flicker. Damage numbers and the combat log still tell you everything.";
  panel.append(motionNote);

  panel.append(
    segmentedRow(
      "Combat camera",
      [
        ["on", "On"],
        ["off", "Fixed"],
      ] as const,
      (value) => (value === "on") === settings.get().combatFeel,
      (value) => settings.update({ combatFeel: value === "on" }),
    ),
  );
  const feelNote = document.createElement("p");
  feelNote.className = "nf-dim";
  feelNote.textContent =
    "The combat camera glides to whoever is acting, holds for a few " +
    "frames when a blow connects, and takes a small knock off the " +
    "heavy ones. Fixed keeps the arena still. Reduced motion switches " +
    "all three off on its own.";
  panel.append(feelNote);

  panel.append(
    segmentedRow(
      "Screen shake",
      SHAKE_SCALES.map(
        (scale) => [String(scale), SHAKE_SCALE_LABELS[scale]] as const,
      ),
      (value) => String(settings.get().shakeScale) === value,
      (value) =>
        settings.update({ shakeScale: clampShakeScale(Number(value)) }),
    ),
  );
  const shakeNote = document.createElement("p");
  shakeNote.className = "nf-dim";
  shakeNote.textContent =
    "How hard heavy hits and blasts knock the view. Off stills the " +
    "shake and leaves the glide and the hit-pause as they are.";
  panel.append(shakeNote);

  const controlsHeading = document.createElement("h3");
  controlsHeading.textContent = "Controls";
  panel.append(controlsHeading);
  for (const [keys, what] of CONTROLS) {
    const row = document.createElement("div");
    row.className = "nf-controls-row";
    const kbd = document.createElement("span");
    kbd.className = "nf-kbd";
    kbd.textContent = keys;
    const desc = document.createElement("span");
    desc.className = "nf-controls-desc";
    desc.textContent = what;
    row.append(kbd, desc);
    panel.append(row);
  }

  const back = document.createElement("button");
  back.className = "nf-button";
  back.textContent = "Back";
  back.addEventListener("click", onClose);
  panel.append(back);

  installListNav(panel);
  return panel;
}

/** In-game overlay form; closing returns to whatever opened it. */
export function createSettingsOverlay(options: {
  onClose(): void;
}): OverlayHandle {
  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";
  el.append(buildSettingsPanel(options.onClose));
  return { el, destroy: () => el.remove() };
}

/** Full-screen form for the main menu; Escape backs out too. */
export function createSettingsScreen(options: { onBack(): void }): Screen {
  let container: HTMLElement | null = null;

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") options.onBack();
  }

  return {
    mount(root: HTMLElement): void {
      audio.setMusicContext("menu");
      container = document.createElement("div");
      container.className = "nf-screen";
      const panel = buildSettingsPanel(options.onBack);
      container.append(panel);
      root.append(container);
      window.addEventListener("keydown", onKeyDown);
      focusFirst(panel);
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      container?.remove();
      container = null;
    },
  };
}
