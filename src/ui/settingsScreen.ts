import { audio, formatFader, musicScene } from "../audio";
import { ASSISTS } from "../data/assists";
import { MIX_BUSES, type MixBusDef } from "../data/mixBuses";
import { DIFFICULTIES, requireDifficulty } from "../data/difficulty";
import type { AssistId } from "../data/assists";
import type { DifficultyId } from "../data/difficulty";
import {
  resetGraphicsSettings,
  settings,
  TEXT_SPEEDS,
  type TextSpeed,
} from "../settings";
import { withAssist, withDifficulty, type RunRules } from "../state";
import { focusFirst, installListNav } from "./focus";
import { GRAPHICS_GROUPS, type GraphicsControl } from "./graphicsModel";
import type { OverlayHandle } from "./overlay";
import type { Screen } from "./screen";

/**
 * The Settings panel: the audio mixer, text speed, the Graphics &
 * Comfort section, the difficulty and assist switches, and the keyboard
 * controls reference — all persisted by the settings store. Built once,
 * used two ways — as a full screen from the main menu and as an in-game
 * overlay from the pause menu.
 *
 * ## Graphics & Comfort is a table, not a hand-written section
 *
 * Eleven visual switches arrived one v2 task at a time, each with a row
 * and a paragraph written in place here. They are now described in
 * src/ui/graphicsModel.ts — groups, labels, blurbs, and the pure
 * read/write pair per control — and this file renders that description.
 * Adding a switch is adding a table entry; the section's reset control
 * restores exactly the fields the table covers, because both read the
 * same list (GRAPHICS_SETTING_KEYS).
 *
 * ## The mixer strips
 *
 * One strip per bus (src/data/mixBuses.ts): a fader, what it is set to
 * in both percent and decibels, a mute, and a test tone. The tone is
 * there because a fader with no reference is a guess — the panel is
 * usually opened over a quiet moment, and "is the music too loud" cannot
 * be answered by a screen with no music on it. Pressing it plays a
 * reference tone *on that bus*, through everything above it, so what you
 * hear is what that fader does.
 *
 * Every strip is a native range input and native buttons, so arrows,
 * Home/End and Page Up/Down work without this file implementing any of
 * it; the readout is mirrored into aria-valuetext so it is spoken as
 * "72 percent, minus 6.7 decibels" rather than as a bare number.
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

/**
 * One bus's strip. Returns the rows it is made of plus a sync() the
 * section calls when something *else* moved the mixer — muting master
 * changes what every other strip is doing, and a strip that did not
 * notice would be lying about it.
 */
function mixerStrip(bus: MixBusDef): {
  rows: HTMLElement[];
  sync(): void;
} {
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "1";
  slider.setAttribute("aria-label", `${bus.label} volume`);
  slider.dataset.bus = bus.id;

  const readout = document.createElement("span");
  readout.className = "nf-mixer-readout";
  // The slider speaks its own value through aria-valuetext; this is the
  // same text for eyes, and would only be read out twice.
  readout.setAttribute("aria-hidden", "true");

  const mute = document.createElement("button");
  mute.className = "nf-button nf-button-small";
  mute.dataset.mute = bus.id;

  const tone = document.createElement("button");
  tone.className = "nf-button nf-button-small";
  tone.textContent = "Test";
  tone.dataset.tone = bus.id;
  tone.setAttribute("aria-label", `Play a test tone on ${bus.label}`);

  function sync(): void {
    const mixer = audio.getMixer();
    const position = mixer.volumes[bus.id];
    const text = formatFader(position);
    // Only written when it actually differs: assigning to .value while
    // the player is dragging the same slider fights the drag.
    const percent = String(Math.round(position * 100));
    if (slider.value !== percent) slider.value = percent;
    slider.setAttribute("aria-valuetext", text);
    readout.textContent = text;

    const muted = mixer.mutes[bus.id] === true;
    mute.textContent = muted ? "Unmute" : "Mute";
    mute.setAttribute("aria-pressed", String(muted));
    mute.setAttribute(
      "aria-label",
      `${muted ? "Unmute" : "Mute"} ${bus.label}`,
    );
    mute.classList.toggle("nf-selected", muted);
    // Nothing to calibrate against on a bus that cannot be heard —
    // whether that is its own mute, its fader, or master's.
    tone.disabled = !audio.isAudible(bus.id);
  }

  slider.addEventListener("input", () => {
    audio.setBusVolume(bus.id, Number(slider.value) / 100);
  });
  mute.addEventListener("click", () => audio.toggleBusMuted(bus.id));
  tone.addEventListener("click", () => audio.playTestTone(bus.id));

  const blurb = document.createElement("p");
  blurb.className = "nf-dim nf-mixer-blurb";
  blurb.textContent = bus.blurb;

  const row = settingRow(bus.label, slider, readout, mute, tone);
  row.classList.add("nf-mixer-row");
  sync();
  return { rows: [row, blurb], sync };
}

/**
 * The mixer: a strip per bus, then the ducking switch. Every control
 * re-syncs every strip after it acts, because they are not independent —
 * master's fader and mute are in the signal path of all three others.
 */
function buildMixerSection(panel: HTMLElement): void {
  const heading = document.createElement("h3");
  heading.textContent = "Audio";
  panel.append(heading);

  const strips = MIX_BUSES.map(mixerStrip);
  const syncAll = (): void => {
    for (const strip of strips) strip.sync();
  };
  for (const strip of strips) panel.append(...strip.rows);
  // One listener for the section rather than a callback threaded through
  // every control: anything that changes the mixer, from anywhere,
  // leaves every strip telling the truth.
  panel.addEventListener("input", syncAll);
  panel.addEventListener("click", syncAll);

  panel.append(
    segmentedRow(
      "When you look away",
      [
        ["on", "Quiet down"],
        ["off", "Keep playing"],
      ] as const,
      (value) => (value === "on") === audio.getMixer().duckOnBlur,
      (value) => {
        audio.setDuckOnBlur(value === "on");
        syncAll();
      },
    ),
  );
  const duckNote = document.createElement("p");
  duckNote.className = "nf-dim";
  duckNote.textContent =
    "Clicking away turns the game down; switching to another tab stops " +
    "it altogether, and it picks up where it was when you come back. " +
    "Keep playing if you run it on a second screen.";
  panel.append(duckNote);
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

/** A dim paragraph of explanatory copy. */
function note(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "nf-dim";
  el.textContent = text;
  return el;
}

/**
 * The Graphics & Comfort section: every visual switch in the game,
 * grouped, described, and rendered straight off the table in
 * ./graphicsModel.ts.
 *
 * Every row re-syncs after any of them is touched. Most are
 * independent, but "reset this section" moves all eleven at once, and a
 * row still showing what it used to be set to would be lying.
 */
function buildGraphicsSection(panel: HTMLElement): void {
  const heading = document.createElement("h3");
  heading.textContent = "Graphics & Comfort";
  panel.append(heading);
  panel.append(
    note(
      "How the game looks and how much of it moves. None of these change " +
        "what happens, what you are told, or how hard anything hits.",
    ),
  );

  const syncs: Array<() => void> = [];
  const syncAll = (): void => {
    for (const sync of syncs) sync();
  };

  function controlRow(control: GraphicsControl): void {
    const row = segmentedRow(
      control.label,
      control.options.map((option) => [option.value, option.label] as const),
      (value) => control.value(settings.get()) === value,
      (value) => {
        settings.update(control.patch(value));
        syncAll();
      },
    );
    row.dataset.setting = control.id;
    panel.append(row, note(control.blurb));
    syncs.push(() => {
      const chosen = control.value(settings.get());
      for (const button of row.querySelectorAll<HTMLButtonElement>("button")) {
        const selected = button.dataset.value === chosen;
        button.classList.toggle("nf-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
    });
  }

  for (const group of GRAPHICS_GROUPS) {
    const groupHeading = document.createElement("h4");
    groupHeading.textContent = group.title;
    panel.append(groupHeading);
    if (group.blurb !== null) panel.append(note(group.blurb));
    for (const control of group.controls) controlRow(control);
  }

  const reset = document.createElement("button");
  reset.className = "nf-button nf-button-small";
  reset.textContent = "Reset graphics & comfort";
  reset.dataset.reset = "graphics";
  reset.addEventListener("click", () => {
    audio.emit("ui.confirm");
    // The whole section at once, and nothing outside it: the mixer,
    // the text speed, the difficulty, and the assists are somebody
    // else's settings and are left exactly where they were.
    settings.update(resetGraphicsSettings(settings.get()));
    syncAll();
  });
  panel.append(settingRow("Start over", reset));
  panel.append(
    note(
      "Puts every switch in this section back to how the game shipped. " +
        "Nothing else on this panel is touched.",
    ),
  );

  syncAll();
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

  buildMixerSection(panel);

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

  buildGraphicsSection(panel);

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
    name: "settings",
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
