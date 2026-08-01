import { audio, musicScene, type VolumeChannel } from "../audio";
import { ASSISTS } from "../data/assists";
import { DIFFICULTIES, requireDifficulty } from "../data/difficulty";
import type { AssistId } from "../data/assists";
import type { DifficultyId } from "../data/difficulty";
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
import { withAssist, withDifficulty, type RunRules } from "../state";
import { focusFirst, installListNav } from "./focus";
import type { OverlayHandle } from "./overlay";
import type { Screen } from "./screen";

/**
 * The Settings panel: audio mixer (persisted by the audio bus), text
 * speed and reduced motion (persisted by the settings store), the
 * difficulty and assist switches, and the keyboard controls reference.
 * Built once, used two ways — as a full screen from the main menu and
 * as an in-game overlay from the pause menu.
 *
 * ## Difficulty in two places, on purpose
 *
 * Everything else here is a device preference and there is nothing else
 * for it to be. Difficulty and the assists are also a fact about the
 * *run* (see src/state/rules.ts), so the panel takes an optional handle
 * onto the live one: with it, a change is written to the run as well as
 * the preference and takes effect immediately; without it — opened from
 * the main menu, with no run to change — the rows say plainly that they
 * are setting what the next run will start on.
 *
 * Changing the preset mid-run asks first. Not because anything is at
 * stake — there is nothing to lock and nothing to take away — but
 * because the save records that it happened, and a record written
 * without being mentioned is a record kept behind somebody's back.
 */

/** A handle onto the live run's rules, when the panel is opened over one. */
export interface RunRulesHandle {
  get(): RunRules;
  /** Writes the run. The caller owns persisting it (see gameScreen). */
  set(next: RunRules): void;
}

export interface SettingsPanelOptions {
  onClose(): void;
  /** The run being played, when there is one. */
  rules?: RunRulesHandle | null;
}

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
  ["X", "Crouch-walk, where somebody is watching"],
  ["F", "Take down a guard · lunge past a gap"],
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
  slider.addEventListener("change", () => audio.emit("ui.confirm"));
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

/**
 * The difficulty rows, plus the assists.
 *
 * Rebuilt in place rather than re-rendered wholesale, because the
 * confirmation is a row that appears between the buttons and the note —
 * and because everything else on this panel is a build-once control.
 */
function buildRulesSection(
  panel: HTMLElement,
  run: RunRulesHandle | null,
): void {
  const heading = document.createElement("h3");
  heading.textContent = "Difficulty";
  panel.append(heading);

  /** The preset in force: the run's, or the preference outside one. */
  const currentDifficulty = (): DifficultyId =>
    run ? run.get().difficulty : settings.get().difficulty;

  /** Whether one assist is on, from whichever record is authoritative. */
  const assistIsOn = (id: AssistId): boolean =>
    run ? run.get().assists[id] === true : settings.get().assists[id] === true;

  const confirmRow = document.createElement("div");
  confirmRow.className = "nf-setting-confirm";
  confirmRow.hidden = true;

  const blurb = document.createElement("p");
  blurb.className = "nf-dim";

  let syncDifficulty = (): void => {};

  /**
   * Writes a preset to whichever records it. The run always gets the
   * preference too, so the *next* run remembers what this one settled
   * on — which is what "New Game+ keeps the chosen difficulty" is.
   */
  function commitDifficulty(id: DifficultyId): void {
    settings.update({ difficulty: id });
    if (run) run.set(withDifficulty(run.get(), id));
    confirmRow.hidden = true;
    confirmRow.replaceChildren();
    syncDifficulty();
  }

  /** Mid-run: ask, in the panel, before the record is written. */
  function askDifficulty(id: DifficultyId): void {
    if (id === currentDifficulty()) return;
    if (!run) {
      commitDifficulty(id);
      return;
    }
    const preset = requireDifficulty(id);
    confirmRow.replaceChildren();
    const question = document.createElement("span");
    question.className = "nf-setting-label";
    question.textContent =
      `Switch this run to ${preset.label}? It takes effect at once, and ` +
      "the save will record that the difficulty was changed.";
    const yes = document.createElement("button");
    yes.className = "nf-button nf-button-small";
    yes.textContent = `Switch to ${preset.label}`;
    yes.dataset.confirm = id;
    yes.addEventListener("click", () => {
      audio.emit("ui.confirm");
      commitDifficulty(id);
    });
    const no = document.createElement("button");
    no.className = "nf-button nf-button-small";
    no.textContent = "Keep playing";
    no.addEventListener("click", () => {
      audio.emit("ui.cancel");
      confirmRow.hidden = true;
      confirmRow.replaceChildren();
    });
    confirmRow.append(question, yes, no);
    confirmRow.hidden = false;
    yes.focus();
  }

  const difficultyRow = segmentedRow(
    run ? "This run" : "New runs start on",
    DIFFICULTIES.map((entry) => [entry.id, entry.label] as const),
    (id) => currentDifficulty() === id,
    askDifficulty,
  );
  // segmentedRow syncs itself on click; the confirmation path means a
  // click can be refused, so the row is re-synced from the record
  // whenever the record actually moves.
  syncDifficulty = (): void => {
    for (const button of difficultyRow.querySelectorAll<HTMLButtonElement>(
      "button",
    )) {
      const selected = button.dataset.value === currentDifficulty();
      button.classList.toggle("nf-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    }
    blurb.textContent = requireDifficulty(currentDifficulty()).blurb;
  };
  syncDifficulty();

  panel.append(difficultyRow, confirmRow, blurb);

  if (run?.get().difficultyChanged === true) {
    const changed = document.createElement("p");
    changed.className = "nf-dim";
    changed.textContent =
      "This run has had its difficulty changed. Nothing is locked out by " +
      "that — the save simply says so.";
    panel.append(changed);
  }

  const assistHeading = document.createElement("h3");
  assistHeading.textContent = "Assists";
  panel.append(assistHeading);
  const assistNote = document.createElement("p");
  assistNote.className = "nf-dim";
  assistNote.textContent = run
    ? "Independent of difficulty, and of each other. Every one of them " +
      "takes effect immediately and none of them changes a die roll."
    : "Independent of difficulty, and of each other. These are what a " +
      "new run will start with.";
  panel.append(assistNote);

  for (const assist of ASSISTS) {
    panel.append(
      segmentedRow(
        assist.label,
        [
          ["on", "On"],
          ["off", "Off"],
        ] as const,
        (value) => (value === "on") === assistIsOn(assist.id),
        (value) => {
          const on = value === "on";
          settings.update({
            assists: { ...settings.get().assists, [assist.id]: on },
          });
          if (run) run.set(withAssist(run.get(), assist.id, on));
        },
      ),
    );
    const note = document.createElement("p");
    note.className = "nf-dim";
    note.textContent = assist.blurb;
    panel.append(note);
  }
}

function buildSettingsPanel(options: SettingsPanelOptions): HTMLElement {
  const { onClose } = options;
  const run = options.rules ?? null;
  const panel = document.createElement("div");
  panel.className = "nf-panel nf-settings";

  const title = document.createElement("h2");
  title.textContent = "Settings";
  panel.append(title);

  buildRulesSection(panel, run);

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
export function createSettingsOverlay(
  options: SettingsPanelOptions,
): OverlayHandle {
  const el = document.createElement("div");
  el.className = "nf-overlay nf-overlay-center";
  el.append(buildSettingsPanel(options));
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
      audio.setMusicScene(musicScene("menu"));
      container = document.createElement("div");
      container.className = "nf-screen";
      // No run to change from the main menu: the rows set what the
      // next one will start on, and say so.
      const panel = buildSettingsPanel({ onClose: options.onBack });
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
