import { audio } from "../audio";
import {
  APPEARANCE_FIELDS,
  CharacterCreationError,
  POINT_POOL,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  advance,
  applyBonuses,
  baseStats,
  canAdvance,
  canGoBack,
  canJumpTo,
  createCharacter,
  createWizard,
  defaultAppearance,
  deriveAttributes,
  draftsEqual,
  goBack,
  jumpTo,
  presetAppearanceFor,
  randomizeUnlocked,
  stepValid,
  updateDraft,
  validateAllocation,
  validateAppearance,
  type Appearance,
  type AppearanceLocks,
  type DerivedAttributes,
  type Stats,
  type WizardContext,
  type WizardDraft,
  type WizardState,
  type WizardStep,
} from "../character";
import {
  APPEARANCE_TABS,
  backgroundPresets,
  backgrounds,
  getAppearanceOption,
  getItem,
  introArc,
} from "../data";
import { emptyEquipment, type EquipmentState } from "../inventory/equipment";
import { createRng, type RngState } from "../state/rng";
import { startingEquipment } from "../inventory/startingGear";
import { applyNewGamePlus, createNewGame } from "../state";
import { DIFFICULTIES, requireDifficulty } from "../data/difficulty";
import type { DifficultyId } from "../data/difficulty";
import { settings, settingsRules } from "../settings";
import { createAppearancePicker } from "./appearancePicker";
import {
  createAppearancePreview,
  type AppearancePreview,
} from "./appearancePreview";
import { DEFAULT_PREVIEW_STATE, type PreviewState } from "./previewState";
import {
  characterNameError,
  formatBonuses,
  pointBuyErrorMessage,
  statLabel,
} from "./format";
import {
  captureFocus,
  focusFirst,
  installListNav,
  installRovingGrid,
  restoreFocus,
} from "./focus";
import { APPEARANCE_LABELS, reviewModel } from "./reviewModel";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { portraitCanvas } from "./portraits";
import { showScreen, type Screen } from "./screen";
import { createSession } from "./session";

/**
 * Character creation as a stepped wizard: identity → background →
 * point-buy stats → appearance → review. The step machine
 * (src/character/wizard.ts) owns navigation and per-step validity; this
 * screen renders whichever step is active and dispatches transitions.
 * The whole draft lives in memory for the life of the screen, so moving
 * between steps never loses a choice. In New Game+ mode a modest,
 * clearly-labeled carry-over applies: bonus point-buy points, one
 * legacy item picked from the finishing character's gear, and the
 * finishing character's look seeding the appearance step.
 *
 * The appearance step hosts the visual picker (./appearancePicker):
 * category tabs of live-baked thumbnails beside the live animated
 * preview (./appearancePreview) — the composed character in the chosen
 * background's starting gear with rotate/walk/zoom controls (Q/E, W,
 * +/− hotkeys) and a portrait inset — plus stock/randomize shortcuts.
 * Picks update the picker and preview in place — no step re-render —
 * so keyboard focus survives.
 */
export interface NewGamePlusOffer {
  /** Extra point-buy points on top of the standard pool. */
  bonusPoints: number;
  /** Item ids the finishing character passed forward; the player picks one. */
  legacyItemIds: string[];
  /**
   * The finishing character's look, seeded as the wizard's initial
   * working appearance (every field stays editable). Absent or invalid
   * looks fall back to the stock defaults.
   */
  legacyAppearance?: Appearance | null;
}

export interface CharacterCreateOptions {
  ngPlus?: NewGamePlusOffer;
  /**
   * RNG state the "Surprise Me" button draws from; injected by tests
   * for determinism. Defaults to a wall-clock seed — each visit to the
   * screen shuffles differently, but successive clicks within it still
   * walk one deterministic sequence.
   */
  appearanceRng?: RngState;
}

export function createCharacterCreateScreen(
  options: CharacterCreateOptions = {},
): Screen {
  let container: HTMLElement | null = null;
  let stepBody: HTMLElement | null = null;
  let progressEl: HTMLElement | null = null;
  let navHint: HTMLElement | null = null;
  let backButton: HTMLButtonElement | null = null;
  let nextButton: HTMLButtonElement | null = null;
  let exitConfirm: HTMLElement | null = null;
  /** Visually hidden polite live region announcing selection changes. */
  let liveRegion: HTMLElement | null = null;

  const ngPlus = options.ngPlus ?? null;
  // Drop legacy ids with no content behind them (future-proofing).
  const legacyChoices = ngPlus
    ? ngPlus.legacyItemIds.filter((id) => getItem(id) !== undefined)
    : [];
  // The carried look seeds the working appearance only while every id
  // still validates — retired options fall back to the stock look.
  const legacyLook =
    ngPlus?.legacyAppearance &&
    validateAppearance(ngPlus.legacyAppearance).length === 0
      ? { ...ngPlus.legacyAppearance }
      : null;
  const pointPool = POINT_POOL + (ngPlus?.bonusPoints ?? 0);
  const context: WizardContext = {
    pointPool,
    backgroundIds: backgrounds.map((background) => background.id),
  };
  const initialDraft: WizardDraft = {
    name: "",
    backgroundId: backgrounds[0]?.id ?? "",
    allocation: baseStats(),
    appearance: legacyLook ?? defaultAppearance(),
    legacyItemId: legacyChoices[0] ?? null,
  };
  let wizard: WizardState = createWizard(initialDraft);
  /** Errors from a rejected final confirm; cleared on any edit. */
  let submitErrors: string[] = [];
  /** Active appearance-picker tab, preserved across step re-renders. */
  let appearanceTab: string = APPEARANCE_TABS[0].id;
  /** Live preview view state, preserved across step re-renders. */
  let previewState: PreviewState = DEFAULT_PREVIEW_STATE;
  /** The mounted preview panel while the appearance step is showing. */
  let preview: AppearancePreview | null = null;
  /** First entry to the appearance step seeds from the background preset
   * — unless the NG+ carried look already claimed the working appearance. */
  let appearanceSeeded = legacyLook !== null;
  /** Set by a review Edit link: finishing that step returns to review. */
  let returnToReview = false;
  /**
   * The preset this runner will go out into the city on. Seeded from
   * the stored preference — which is what the last run settled on, so a
   * New Game+ character keeps the difficulty of the run that earned it
   * unless it is changed right here — and written back on confirm.
   */
  let difficulty: DifficultyId = settings.get().difficulty;
  /** Per-category locks; locked categories survive Surprise Me. */
  let locks: AppearanceLocks = {};
  /** Advancing RNG behind Surprise Me — each click rolls a new look. */
  let surpriseRng: RngState =
    options.appearanceRng ?? createRng(Date.now() >>> 0);

  function draft(): WizardDraft {
    return wizard.draft;
  }

  function selectedBackground() {
    return (
      backgrounds.find((b) => b.id === draft().backgroundId) ?? backgrounds[0]
    );
  }

  /**
   * Equipment the previews dress the draft in: the chosen background's
   * starting gear. Bad gear content degrades to empty hands.
   */
  function previewEquipment(): EquipmentState {
    const background = selectedBackground();
    if (!background) return emptyEquipment();
    try {
      return startingEquipment(background);
    } catch (error) {
      console.error("Unresolvable starting gear; previewing bare", error);
      return emptyEquipment();
    }
  }

  /**
   * Polite screen-reader announcement ("Hair Style: Mohawk"). Repeats
   * of the same text get a trailing no-break space so live regions see
   * a change and re-announce.
   */
  function announce(text: string): void {
    if (!liveRegion) return;
    liveRegion.textContent =
      liveRegion.textContent === text ? `${text} ` : text;
  }

  /**
   * Draft edit: re-render the active step in place, keeping keyboard
   * focus on the control that made the edit (or its successor).
   */
  function patchDraft(patch: Partial<WizardDraft>): void {
    submitErrors = [];
    wizard = updateDraft(wizard, patch);
    const snapshot = stepBody ? captureFocus(stepBody) : null;
    renderStep();
    renderChrome();
    if (stepBody) restoreFocus(stepBody, snapshot);
  }

  /** Step change: render the new step and move focus into it. */
  function navigate(next: WizardState): void {
    if (next.step === wizard.step) return;
    // First entry to the appearance step seeds the working look from
    // the chosen background's first preset; after that the draft is the
    // player's and navigation never overwrites it.
    if (next.step === "appearance" && !appearanceSeeded) {
      appearanceSeeded = true;
      next = updateDraft(next, {
        appearance: presetAppearanceFor(next.draft.backgroundId),
      });
    }
    wizard = next;
    if (wizard.step === "review") returnToReview = false;
    // One cue for every step change, forwards or back: the sound is
    // "that page is behind you", which is true in both directions.
    audio.emit("ui.wizard.step");
    renderStep();
    renderChrome();
    announce(
      `Step ${WIZARD_STEPS.indexOf(wizard.step) + 1} of ` +
        `${WIZARD_STEPS.length}: ${WIZARD_STEP_LABELS[wizard.step]}`,
    );
    if (stepBody) focusFirst(stepBody);
  }

  /** The active step's blocking problem, or null when it can advance. */
  function stepProblem(): string | null {
    const current = draft();
    switch (wizard.step) {
      case "identity":
        return characterNameError(current.name);
      case "background":
        return stepValid(current, "background", context)
          ? null
          : "Pick a background";
      case "stats": {
        const validation = validateAllocation(current.allocation, pointPool);
        const first = validation.errors[0];
        return first ? pointBuyErrorMessage(first) : null;
      }
      case "appearance":
        return stepValid(current, "appearance", context)
          ? null
          : "This look references unknown options";
      case "review":
        return stepValid(current, "review", context)
          ? null
          : "Finish the earlier steps before jacking in";
    }
  }

  // --- Step content ---

  function renderIdentity(body: HTMLElement): void {
    const nameLabel = document.createElement("label");
    nameLabel.className = "nf-field-label";
    nameLabel.textContent = "Name";
    nameLabel.htmlFor = "nf-name-input";
    const nameInput = document.createElement("input");
    nameInput.id = "nf-name-input";
    nameInput.className = "nf-input";
    nameInput.maxLength = 32;
    nameInput.placeholder = "Your street name";
    nameInput.value = draft().name;
    // Update the draft without re-rendering the step, so the input
    // keeps focus and caret while typing.
    nameInput.addEventListener("input", () => {
      submitErrors = [];
      wizard = updateDraft(wizard, { name: nameInput.value });
      renderChrome();
    });

    const note = document.createElement("p");
    note.className = "nf-dim";
    note.textContent =
      "Pick the name the street will know you by. Everything else can " +
      "change later — this can't.";

    body.append(nameLabel, nameInput, note);

    if (ngPlus) {
      const legacyNote = document.createElement("p");
      legacyNote.className = "nf-dim";
      legacyNote.textContent =
        `New Game+ bonus: +${ngPlus.bonusPoints} point-buy points and ` +
        "one piece of your last runner's gear. Their perks do not come " +
        "along — street cred is earned, never inherited." +
        (legacyLook
          ? " Their look carries over too — restyle it on the Appearance step."
          : "");
      body.append(legacyNote);
    }
  }

  function renderBackground(body: HTMLElement): void {
    const columns = document.createElement("div");
    columns.className = "nf-create-columns";

    const left = document.createElement("div");
    left.className = "nf-create-column";
    const heading = document.createElement("h3");
    heading.textContent = "Background";
    const list = document.createElement("div");
    list.className = "nf-bg-list";
    list.setAttribute("role", "radiogroup");
    list.setAttribute("aria-label", "Background");
    for (const background of backgrounds) {
      const button = document.createElement("button");
      button.className = "nf-bg-card";
      const selected = background.id === draft().backgroundId;
      if (selected) button.classList.add("nf-selected");
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(selected));
      button.dataset.focusKey = `bg:${background.id}`;
      const title = document.createElement("div");
      title.className = "nf-bg-name";
      title.textContent = background.name;
      const bonuses = document.createElement("div");
      bonuses.className = "nf-bg-bonuses";
      bonuses.textContent = formatBonuses(background.statBonuses);
      button.append(title, bonuses);
      button.addEventListener("click", () => {
        announce(`Background: ${background.name}`);
        patchDraft({ backgroundId: background.id });
      });
      list.append(button);
    }
    installRovingGrid(list, {
      itemSelector: ".nf-bg-card",
      columns: () => 1,
      primary: (items) =>
        items.find((item) => item.getAttribute("aria-checked") === "true"),
    });
    left.append(heading, list);

    const right = document.createElement("div");
    right.className = "nf-create-column";
    const background = selectedBackground();
    if (background) {
      const detail = document.createElement("div");
      detail.className = "nf-bg-detail";
      const description = document.createElement("p");
      description.className = "nf-bg-description";
      description.textContent = background.description;
      const gear = document.createElement("p");
      gear.className = "nf-dim";
      gear.textContent =
        "Starting gear: " +
        background.startingGearIds
          .map((id) => getItem(id)?.name ?? id)
          .join(", ");
      detail.append(description, gear);
      right.append(detail);
    }

    // New Game+ carry-over: clearly labeled, one pick, nothing hidden.
    if (ngPlus) {
      const legacyHeading = document.createElement("h3");
      legacyHeading.textContent = "Legacy carry-over";
      const legacyNote = document.createElement("p");
      legacyNote.className = "nf-dim";
      legacyNote.textContent =
        "One piece of your last runner's gear comes along.";
      const legacyList = document.createElement("div");
      legacyList.className = "nf-bg-list";
      legacyList.setAttribute("role", "radiogroup");
      legacyList.setAttribute("aria-label", "Legacy carry-over");
      const picks: Array<[string | null, string, string]> = legacyChoices.map(
        (id) => {
          const item = getItem(id)!;
          return [id, item.name, item.description] as [string, string, string];
        },
      );
      picks.push([
        null,
        "Travel light",
        "Carry nothing forward but the bonus points.",
      ]);
      for (const [id, title, detail] of picks) {
        const button = document.createElement("button");
        button.className = "nf-bg-card";
        const selected = id === draft().legacyItemId;
        if (selected) button.classList.add("nf-selected");
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(selected));
        button.dataset.focusKey = `legacy:${id ?? "none"}`;
        const nameEl = document.createElement("div");
        nameEl.className = "nf-bg-name";
        nameEl.textContent = title;
        const detailEl = document.createElement("div");
        detailEl.className = "nf-bg-bonuses";
        detailEl.textContent = detail;
        button.append(nameEl, detailEl);
        button.addEventListener("click", () => {
          announce(`Legacy carry-over: ${title}`);
          patchDraft({ legacyItemId: id });
        });
        legacyList.append(button);
      }
      installRovingGrid(legacyList, {
        itemSelector: ".nf-bg-card",
        columns: () => 1,
        primary: (items) =>
          items.find((item) => item.getAttribute("aria-checked") === "true"),
      });
      right.append(legacyHeading, legacyNote, legacyList);
    }

    columns.append(left, right);
    body.append(columns);
  }

  function derivedPreview(derived: DerivedAttributes): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "nf-derived";
    const title = document.createElement("h3");
    title.textContent = "Derived";
    preview.append(title);
    const entries: Array<[string, number]> = [
      ["Max HP", derived.maxHp],
      ["Initiative", derived.initiative],
      ["Neural capacity", derived.neuralCapacity],
      ["Melee damage bonus", derived.meleeDamageBonus],
      ["Ranged damage bonus", derived.rangedDamageBonus],
    ];
    for (const [label, amount] of entries) {
      const line = document.createElement("div");
      line.className = "nf-derived-row";
      line.textContent = `${label}: ${amount}`;
      preview.append(line);
    }
    return preview;
  }

  function renderStats(body: HTMLElement): void {
    const allocation = draft().allocation;
    const background = selectedBackground();
    const validation = validateAllocation(allocation, pointPool);
    const finalStats = background
      ? applyBonuses(allocation, background.statBonuses)
      : allocation;

    const columns = document.createElement("div");
    columns.className = "nf-create-columns";

    const left = document.createElement("div");
    left.className = "nf-create-column";
    const heading = document.createElement("h3");
    heading.textContent = ngPlus
      ? `Stats (${POINT_POOL} + ${ngPlus.bonusPoints} legacy points)`
      : `Stats (${POINT_POOL} points)`;
    const remaining = document.createElement("div");
    remaining.className = "nf-remaining";
    remaining.textContent = `Points remaining: ${validation.remaining}`;

    const rows = document.createElement("div");
    rows.className = "nf-stat-rows";
    for (const key of STAT_KEYS) {
      const row = document.createElement("div");
      row.className = "nf-stat-row";

      const label = document.createElement("span");
      label.className = "nf-stat-label";
      label.textContent = statLabel(key);

      const setStat = (value: number) =>
        patchDraft({ allocation: { ...allocation, [key]: value } as Stats });

      const minus = document.createElement("button");
      minus.className = "nf-button nf-button-small";
      minus.textContent = "−";
      minus.setAttribute("aria-label", `Decrease ${statLabel(key)}`);
      minus.dataset.focusKey = `stat:${key}:minus`;
      minus.disabled = allocation[key] <= STAT_MIN;
      minus.addEventListener("click", () => setStat(allocation[key] - 1));

      const value = document.createElement("span");
      value.className = "nf-stat-value";
      value.textContent = String(allocation[key]);

      const plus = document.createElement("button");
      plus.className = "nf-button nf-button-small";
      plus.textContent = "+";
      plus.setAttribute("aria-label", `Increase ${statLabel(key)}`);
      plus.dataset.focusKey = `stat:${key}:plus`;
      plus.disabled = allocation[key] >= STAT_MAX || validation.remaining <= 0;
      plus.addEventListener("click", () => setStat(allocation[key] + 1));

      const final = document.createElement("span");
      final.className = "nf-stat-final";
      const bonus = finalStats[key] - allocation[key];
      final.textContent =
        bonus !== 0
          ? `→ ${finalStats[key]} (${bonus > 0 ? "+" : ""}${bonus})`
          : `→ ${finalStats[key]}`;

      row.append(label, minus, value, plus, final);
      rows.append(row);
    }
    left.append(heading, remaining, rows);

    const right = document.createElement("div");
    right.className = "nf-create-column";
    right.append(derivedPreview(deriveAttributes(finalStats)));

    columns.append(left, right);
    body.append(columns);
  }

  function appearanceSummary(): HTMLElement {
    const summary = document.createElement("div");
    summary.className = "nf-appearance-summary";
    for (const field of APPEARANCE_FIELDS) {
      const id = draft().appearance[field];
      const row = document.createElement("div");
      row.className = "nf-appearance-row";
      row.textContent =
        `${APPEARANCE_LABELS[field]}: ` +
        (getAppearanceOption(field, id)?.label ?? id);
      summary.append(row);
    }
    return summary;
  }

  function renderAppearance(body: HTMLElement): void {
    const columns = document.createElement("div");
    columns.className = "nf-create-columns nf-appearance-columns";

    const left = document.createElement("div");
    left.className = "nf-create-column";
    const right = document.createElement("div");
    right.className = "nf-create-column";

    const panel = createAppearancePreview({
      appearance: () => draft().appearance,
      equipment: previewEquipment,
      initialState: previewState,
      onStateChange: (state) => {
        previewState = state;
      },
    });
    preview = panel;

    const summaryHost = document.createElement("div");
    const refreshSummary = (): void => {
      summaryHost.replaceChildren(appearanceSummary());
    };
    refreshSummary();

    const presetsHost = document.createElement("div");
    const refreshPresets = (): void => {
      const snapshot = captureFocus(presetsHost);
      presetsHost.replaceChildren(presetSection());
      restoreFocus(presetsHost, snapshot);
    };

    /**
     * The single working-appearance update path: option picks, preset
     * clicks, Surprise Me, and Stock Look all land here, updating the
     * draft, picker, preview, summary, and preset row in place (no step
     * re-render) so keyboard focus survives and everything stays in
     * sync.
     */
    const applyLook = (appearance: Appearance): void => {
      submitErrors = [];
      wizard = updateDraft(wizard, { appearance });
      picker.update();
      panel.update();
      refreshSummary();
      refreshPresets();
      renderChrome();
    };

    const picker = createAppearancePicker({
      appearance: () => draft().appearance,
      initialTab: appearanceTab,
      onTabChange: (tab) => {
        appearanceTab = tab;
      },
      onPick: (category, id) => {
        announce(
          `${APPEARANCE_LABELS[category]}: ` +
            (getAppearanceOption(category, id)?.label ?? id),
        );
        applyLook({ ...draft().appearance, [category]: id });
      },
    });

    /**
     * Preset row: the chosen background's authored looks as portrait
     * thumbnails, each applied wholesale on click. Portraits bake
     * through the same cache as every other thumb.
     */
    function presetSection(): HTMLElement {
      const wrap = document.createElement("div");
      wrap.className = "nf-thumb-section nf-preset-row";
      const heading = document.createElement("span");
      heading.className = "nf-field-label";
      heading.textContent = "Preset looks";

      const row = document.createElement("div");
      row.className = "nf-thumb-grid";
      const presets = backgroundPresets(draft().backgroundId);
      row.style.gridTemplateColumns = `repeat(${Math.max(presets.length, 1)}, max-content)`;
      row.setAttribute("role", "radiogroup");
      row.setAttribute("aria-label", "Preset looks");
      for (const preset of presets) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nf-thumb";
        const selected = APPEARANCE_FIELDS.every(
          (field) => draft().appearance[field] === preset.appearance[field],
        );
        if (selected) button.classList.add("nf-selected");
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", String(selected));
        button.dataset.focusKey = `preset:${preset.label}`;
        button.title = preset.label;
        button.setAttribute("aria-label", `Preset: ${preset.label}`);
        button.append(portraitCanvas(preset.appearance, previewEquipment()));
        button.addEventListener("click", () => {
          announce(`Preset applied: ${preset.label}`);
          applyLook({ ...preset.appearance });
        });
        row.append(button);
      }
      installRovingGrid(row, {
        itemSelector: "button.nf-thumb",
        primary: (items) =>
          items.find((item) => item.getAttribute("aria-checked") === "true"),
      });
      wrap.append(heading, row);
      return wrap;
    }
    refreshPresets();

    /**
     * Lock toggles: one per appearance category; locked categories keep
     * their current pick when Surprise Me rolls.
     */
    const lockSection = (): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.className = "nf-thumb-section";
      const heading = document.createElement("span");
      heading.className = "nf-field-label";
      heading.textContent = "Locks — kept on Surprise Me";
      const row = document.createElement("div");
      row.className = "nf-lock-row";
      for (const field of APPEARANCE_FIELDS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "nf-button nf-button-small nf-lock";
        button.dataset.field = field;
        button.textContent = APPEARANCE_LABELS[field];
        const sync = (): void => {
          const locked = locks[field] === true;
          button.classList.toggle("nf-selected", locked);
          button.setAttribute("aria-pressed", String(locked));
          button.title = locked
            ? `${APPEARANCE_LABELS[field]}: locked (survives Surprise Me)`
            : `${APPEARANCE_LABELS[field]}: unlocked`;
        };
        sync();
        button.addEventListener("click", () => {
          locks = { ...locks, [field]: !locks[field] };
          sync();
        });
        row.append(button);
      }
      wrap.append(heading, row);
      return wrap;
    };

    const controls = document.createElement("div");
    controls.className = "nf-wizard-controls";
    const surprise = document.createElement("button");
    surprise.className = "nf-button";
    surprise.textContent = "Surprise Me";
    surprise.addEventListener("click", () => {
      const roll = randomizeUnlocked(draft().appearance, locks, surpriseRng);
      surpriseRng = roll.state;
      announce("Randomized look applied");
      applyLook(roll.value);
    });
    const stock = document.createElement("button");
    stock.className = "nf-button";
    stock.textContent = "Stock Look";
    stock.addEventListener("click", () => {
      announce("Stock look applied");
      applyLook(defaultAppearance());
    });
    controls.append(surprise, stock);

    left.append(picker.el);
    right.append(panel.el, presetsHost, controls, lockSection(), summaryHost);
    columns.append(left, right);
    body.append(columns);
  }

  function reviewSection(
    title: string,
    step: WizardStep,
    ...content: (HTMLElement | string)[]
  ): HTMLElement {
    const section = document.createElement("div");
    section.className = "nf-review-section";
    const header = document.createElement("div");
    header.className = "nf-review-header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const edit = document.createElement("button");
    edit.className = "nf-button nf-button-small nf-review-edit";
    edit.textContent = "Edit";
    edit.setAttribute("aria-label", `Edit ${title.toLowerCase()}`);
    edit.addEventListener("click", () => {
      returnToReview = true;
      navigate(jumpTo(wizard, step, context));
    });
    header.append(heading, edit);
    section.append(header);
    for (const piece of content) {
      if (typeof piece === "string") {
        const line = document.createElement("p");
        line.className = "nf-review-line";
        line.textContent = piece;
        section.append(line);
      } else {
        section.append(piece);
      }
    }
    return section;
  }

  /**
   * The difficulty picker on the review sheet: a row of presets and the
   * chosen one's blurb underneath. Deliberately not an Edit link to
   * another step — there is no step to jump to — so it carries its own
   * heading and lives inline.
   */
  function difficultySection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "nf-review-section nf-review-difficulty";
    const header = document.createElement("div");
    header.className = "nf-review-header";
    const heading = document.createElement("h3");
    heading.textContent = "Difficulty";
    header.append(heading);
    section.append(header);

    const row = document.createElement("div");
    row.className = "nf-segmented";
    const blurb = document.createElement("p");
    blurb.className = "nf-review-line nf-dim";

    const sync = (): void => {
      for (const button of row.querySelectorAll<HTMLButtonElement>("button")) {
        const selected = button.dataset.value === difficulty;
        button.classList.toggle("nf-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      }
      blurb.textContent = requireDifficulty(difficulty).blurb;
    };

    for (const preset of DIFFICULTIES) {
      const button = document.createElement("button");
      button.className = "nf-button nf-button-small";
      button.textContent = preset.label;
      button.dataset.value = preset.id;
      button.addEventListener("click", () => {
        difficulty = preset.id;
        audio.emit("ui.click");
        sync();
      });
      row.append(button);
    }
    sync();

    section.append(row, blurb);
    const changeable = document.createElement("p");
    changeable.className = "nf-review-line nf-dim";
    changeable.textContent =
      "Changeable later from Settings, along with the assists — the save " +
      "will simply record that it happened.";
    section.append(changeable);
    return section;
  }

  /**
   * The review step as a character sheet: the full-size showcase render
   * (largest crisp zoom, slow facing spin, portrait card on the stage)
   * on the left; on the right the whole draft in words via the pure
   * reviewModel selector, each section with an Edit link that jumps to
   * its step and returns here afterward.
   */
  function renderReview(body: HTMLElement): void {
    // The review summarizes the offer as it actually applied: the
    // carried look only counts when it seeded the working appearance.
    const model = reviewModel(
      draft(),
      ngPlus
        ? { bonusPoints: ngPlus.bonusPoints, legacyAppearance: legacyLook }
        : null,
    );

    const columns = document.createElement("div");
    columns.className = "nf-create-columns nf-review-columns";

    const left = document.createElement("div");
    left.className = "nf-create-column nf-review-figure";
    const panel = createAppearancePreview({
      appearance: () => draft().appearance,
      equipment: previewEquipment,
      showcase: true,
    });
    preview = panel;
    left.append(panel.el);

    const right = document.createElement("div");
    right.className = "nf-create-column nf-review-sheet";

    right.append(
      reviewSection("Identity", "identity", model.name || "—"),
    );

    const backgroundLines: (HTMLElement | string)[] = [];
    if (model.background) {
      backgroundLines.push(
        model.background.bonuses
          ? `${model.background.name} (${model.background.bonuses})`
          : model.background.name,
      );
      const blurb = document.createElement("p");
      blurb.className = "nf-review-line nf-dim";
      blurb.textContent = model.background.blurb;
      backgroundLines.push(blurb);
    }
    if (model.gear.length > 0) {
      backgroundLines.push("Starting gear:");
      const gear = document.createElement("ul");
      gear.className = "nf-review-gear";
      for (const name of model.gear) {
        const item = document.createElement("li");
        item.textContent = name;
        gear.append(item);
      }
      backgroundLines.push(gear);
    }
    right.append(
      reviewSection("Background", "background", ...backgroundLines),
    );

    right.append(
      reviewSection(
        "Stats",
        "stats",
        model.statLine,
        derivedPreview(model.derived),
      ),
    );

    const look = document.createElement("div");
    look.className = "nf-review-appearance";
    for (const line of model.appearance) {
      const row = document.createElement("div");
      row.className = "nf-review-line";
      row.textContent = `${line.label}: ${line.value}`;
      look.append(row);
    }
    right.append(reviewSection("Appearance", "appearance", look));

    if (model.legacy) {
      const legacy = document.createElement("div");
      const legacyLine = document.createElement("p");
      legacyLine.className = "nf-review-line nf-review-legacy";
      legacyLine.textContent = model.legacy.line;
      // What does *not* come along, said out loud on the same panel:
      // the offer is a nudge and the summary has to read like one.
      const excludes = document.createElement("p");
      excludes.className = "nf-review-line nf-dim";
      excludes.textContent = model.legacy.excludes;
      legacy.append(legacyLine, excludes);
      right.append(reviewSection("Legacy carry-over", "background", legacy));
    }

    // The one thing on this panel that is not about the runner: how
    // hard the city is going to be on them. It sits on review rather
    // than getting a step of its own because it is one choice with a
    // default, and because it is changeable later from settings — the
    // wizard is where a run is *set up*, not where it is decided
    // forever.
    right.append(difficultySection());

    const errors = document.createElement("div");
    for (const error of submitErrors) {
      const line = document.createElement("p");
      line.className = "nf-message nf-error";
      line.textContent = error;
      errors.append(line);
    }
    right.append(errors);

    columns.append(left, right);
    body.append(columns);
  }

  function renderStep(): void {
    if (!stepBody) return;
    preview?.destroy();
    preview = null;
    stepBody.replaceChildren();
    switch (wizard.step) {
      case "identity":
        renderIdentity(stepBody);
        break;
      case "background":
        renderBackground(stepBody);
        break;
      case "stats":
        renderStats(stepBody);
        break;
      case "appearance":
        renderAppearance(stepBody);
        break;
      case "review":
        renderReview(stepBody);
        break;
    }
  }

  /** Progress strip, Back/Next state, and the inline validity hint. */
  function renderChrome(): void {
    if (!progressEl || !backButton || !nextButton || !navHint) return;

    progressEl.replaceChildren();
    WIZARD_STEPS.forEach((step, index) => {
      const chip = document.createElement("button");
      chip.className = "nf-wizard-step";
      if (step === wizard.step) {
        chip.classList.add("nf-current");
        chip.setAttribute("aria-current", "step");
      } else if (stepValid(draft(), step, context)) {
        chip.classList.add("nf-done");
      }
      chip.disabled =
        step === wizard.step || !canJumpTo(wizard, step, context);
      const num = document.createElement("span");
      num.className = "nf-wizard-step-num";
      num.textContent = String(index + 1);
      const label = document.createElement("span");
      label.textContent = WIZARD_STEP_LABELS[step];
      chip.append(num, label);
      chip.addEventListener("click", () =>
        navigate(jumpTo(wizard, step, context)),
      );
      progressEl!.append(chip);
    });

    backButton.disabled = !canGoBack(wizard);
    const problem = stepProblem();
    navHint.textContent = problem ?? "";
    if (wizard.step === "review") {
      nextButton.textContent = "Jack In";
      nextButton.disabled = !stepValid(draft(), "review", context);
    } else if (returnToReview) {
      // Entered from a review Edit link: finishing the step goes back
      // to review, under the same validity gate as advancing there.
      nextButton.textContent = "Done";
      nextButton.disabled = !canJumpTo(wizard, "review", context);
    } else {
      nextButton.textContent = "Next";
      nextButton.disabled = !canAdvance(wizard, context);
    }
  }

  // --- Leaving the screen ---

  function exitToMenu(): void {
    audio.emit("ui.cancel");
    showScreen(createMainMenuScreen());
  }

  function closeExitConfirm(): void {
    exitConfirm?.remove();
    exitConfirm = null;
    if (stepBody) focusFirst(stepBody);
  }

  /** Escape / Menu: leave straight away when clean, confirm when dirty. */
  function requestExit(): void {
    if (draftsEqual(draft(), initialDraft)) {
      exitToMenu();
      return;
    }
    if (exitConfirm) return;
    exitConfirm = document.createElement("div");
    exitConfirm.className = "nf-overlay nf-overlay-center";
    const panel = document.createElement("div");
    panel.className = "nf-panel nf-wizard-confirm";
    const title = document.createElement("h2");
    title.textContent = "Abandon this runner?";
    const note = document.createElement("p");
    note.className = "nf-dim";
    note.textContent =
      "Drafts aren't saved — backing out to the menu discards every choice.";
    const menu = document.createElement("div");
    menu.className = "nf-menu";
    const keep = document.createElement("button");
    keep.className = "nf-button";
    keep.textContent = "Keep Editing";
    keep.addEventListener("click", closeExitConfirm);
    const discard = document.createElement("button");
    discard.className = "nf-button nf-button-danger";
    discard.textContent = "Discard Draft";
    discard.addEventListener("click", exitToMenu);
    menu.append(keep, discard);
    panel.append(title, note, menu);
    exitConfirm.append(panel);
    container?.append(exitConfirm);
    installListNav(exitConfirm);
    focusFirst(exitConfirm);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      if (exitConfirm) closeExitConfirm();
      // Review is a summary, not an edit surface: Escape steps back to
      // the appearance step instead of threatening to abandon the draft.
      else if (wizard.step === "review") navigate(goBack(wizard));
      else requestExit();
      return;
    }
    if (exitConfirm) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      return;
    }
    // Live-preview hotkeys while the appearance step is showing.
    if (wizard.step === "appearance" && preview) {
      const key = event.key;
      if (key === "q" || key === "Q") {
        preview.rotate(-1);
        return;
      }
      if (key === "e" || key === "E") {
        preview.rotate(1);
        return;
      }
      if (key === "w" || key === "W") {
        preview.toggleMotion();
        return;
      }
      if (key === "+" || key === "=") {
        preview.stepZoom(1);
        return;
      }
      if (key === "-" || key === "_") {
        preview.stepZoom(-1);
        return;
      }
    }
    // Number-row hotkeys jump straight to a step, same gate as the strip.
    const digit = Number.parseInt(event.key, 10);
    if (digit >= 1 && digit <= WIZARD_STEPS.length) {
      navigate(jumpTo(wizard, WIZARD_STEPS[digit - 1]!, context));
    }
  }

  function confirmCreate(): void {
    const current = draft();
    const background = selectedBackground();
    if (!background || !stepValid(current, "review", context)) return;
    try {
      const character = createCharacter({
        name: current.name,
        background,
        allocation: current.allocation,
        pointPool,
        appearance: current.appearance,
      });
      // The preset goes into the preference first, so the run created
      // from it and the setting the *next* run reads are one choice
      // rather than two that can drift.
      settings.update({ difficulty });
      let state = createNewGame({
        character,
        // Assists come along from the preference untouched — they are
        // not a creation choice, and defaulting them off is what
        // "assists off" means.
        rules: settingsRules(settings.get()),
      });
      if (ngPlus) state = applyNewGamePlus(state, current.legacyItemId);
      const session = createSession(state);
      audio.emit("ui.confirm");
      showScreen(
        createGameScreen({ session, dialogueNodeId: introArc.entryNodeId }),
      );
    } catch (error) {
      if (error instanceof CharacterCreationError) {
        submitErrors = error.errors.map(pointBuyErrorMessage);
        renderStep();
        renderChrome();
      } else {
        throw error;
      }
    }
  }

  return {
    name: "character-create",
    mount(root: HTMLElement): void {
      container = document.createElement("div");
      container.className = "nf-screen";

      const panel = document.createElement("div");
      panel.className = "nf-panel nf-create nf-wizard";

      const header = document.createElement("div");
      header.className = "nf-panel-header";
      const title = document.createElement("h2");
      title.textContent = ngPlus ? "New Runner — New Game+" : "New Runner";
      const menuButton = document.createElement("button");
      menuButton.className = "nf-button nf-button-small";
      menuButton.textContent = "Menu";
      menuButton.addEventListener("click", requestExit);
      header.append(title, menuButton);

      progressEl = document.createElement("nav");
      progressEl.className = "nf-wizard-steps";
      progressEl.setAttribute("aria-label", "Creation steps");

      liveRegion = document.createElement("div");
      liveRegion.className = "nf-sr-only";
      liveRegion.setAttribute("role", "status");
      liveRegion.setAttribute("aria-live", "polite");

      stepBody = document.createElement("div");
      stepBody.className = "nf-wizard-body";

      const nav = document.createElement("div");
      nav.className = "nf-wizard-nav";
      backButton = document.createElement("button");
      backButton.className = "nf-button";
      backButton.textContent = "Back";
      backButton.addEventListener("click", () => navigate(goBack(wizard)));
      navHint = document.createElement("p");
      // Guidance, not an error. The line says what the step still needs
      // and the disabled Next says it cannot be left yet — nobody has
      // failed at anything, least of all the player who has been on the
      // screen for half a second. Real failures (a rejected Jack In)
      // still render in red, on the review step, where they belong.
      navHint.className = "nf-message nf-wizard-hint";
      nextButton = document.createElement("button");
      nextButton.className = "nf-button nf-button-primary";
      nextButton.addEventListener("click", () => {
        if (wizard.step === "review") confirmCreate();
        else if (returnToReview) navigate(jumpTo(wizard, "review", context));
        else navigate(advance(wizard, context));
      });
      nav.append(backButton, navHint, nextButton);

      panel.append(header, progressEl, liveRegion, stepBody, nav);
      container.append(panel);
      root.append(container);

      window.addEventListener("keydown", onKeyDown);
      installListNav(panel);
      renderStep();
      renderChrome();
      document.getElementById("nf-name-input")?.focus();
    },

    unmount(): void {
      window.removeEventListener("keydown", onKeyDown);
      preview?.destroy();
      preview = null;
      container?.remove();
      container = null;
      stepBody = null;
      progressEl = null;
      liveRegion = null;
      navHint = null;
      backButton = null;
      nextButton = null;
      exitConfirm = null;
    },
  };
}
