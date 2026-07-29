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
  seededAppearance,
  stepValid,
  updateDraft,
  validateAllocation,
  type AppearanceField,
  type DerivedAttributes,
  type Stats,
  type WizardContext,
  type WizardDraft,
  type WizardState,
  type WizardStep,
} from "../character";
import {
  APPEARANCE_TABS,
  backgrounds,
  getAppearanceOption,
  getItem,
  introArc,
  type AppearanceTabId,
} from "../data";
import { emptyEquipment } from "../inventory/equipment";
import { applyNewGamePlus, createNewGame } from "../state";
import { createAppearancePicker } from "./appearancePicker";
import {
  characterNameError,
  formatBonuses,
  pointBuyErrorMessage,
  statLabel,
} from "./format";
import { focusFirst, installListNav } from "./focus";
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
 * clearly-labeled carry-over applies: bonus point-buy points and one
 * legacy item picked from the finishing character's gear.
 *
 * The appearance step hosts the visual picker (./appearancePicker):
 * category tabs of live-baked thumbnails beside a live portrait
 * preview, plus stock/randomize shortcuts. Picks update the picker and
 * preview in place — no step re-render — so keyboard focus survives.
 */
export interface NewGamePlusOffer {
  /** Extra point-buy points on top of the standard pool. */
  bonusPoints: number;
  /** Item ids the finishing character passed forward; the player picks one. */
  legacyItemIds: string[];
}

export interface CharacterCreateOptions {
  ngPlus?: NewGamePlusOffer;
}

const APPEARANCE_LABELS: Record<AppearanceField, string> = {
  skinTone: "Skin tone",
  build: "Build",
  hairStyle: "Hair",
  hairColor: "Hair color",
  eyes: "Eyes",
  eyeColor: "Eye color",
  brows: "Brows",
  mouth: "Mouth",
  faceDetail: "Face detail",
  headwear: "Headwear",
};

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

  const ngPlus = options.ngPlus ?? null;
  // Drop legacy ids with no content behind them (future-proofing).
  const legacyChoices = ngPlus
    ? ngPlus.legacyItemIds.filter((id) => getItem(id) !== undefined)
    : [];
  const pointPool = POINT_POOL + (ngPlus?.bonusPoints ?? 0);
  const context: WizardContext = {
    pointPool,
    backgroundIds: backgrounds.map((background) => background.id),
  };
  const initialDraft: WizardDraft = {
    name: "",
    backgroundId: backgrounds[0]?.id ?? "",
    allocation: baseStats(),
    appearance: defaultAppearance(),
    legacyItemId: legacyChoices[0] ?? null,
  };
  let wizard: WizardState = createWizard(initialDraft);
  /** Errors from a rejected final confirm; cleared on any edit. */
  let submitErrors: string[] = [];
  /** Active appearance-picker tab, preserved across step re-renders. */
  let appearanceTab: AppearanceTabId = APPEARANCE_TABS[0].id;

  function draft(): WizardDraft {
    return wizard.draft;
  }

  function selectedBackground() {
    return (
      backgrounds.find((b) => b.id === draft().backgroundId) ?? backgrounds[0]
    );
  }

  /** Draft edit: re-render the active step in place (no focus move). */
  function patchDraft(patch: Partial<WizardDraft>): void {
    submitErrors = [];
    wizard = updateDraft(wizard, patch);
    renderStep();
    renderChrome();
  }

  /** Step change: render the new step and move focus into it. */
  function navigate(next: WizardState): void {
    if (next.step === wizard.step) return;
    wizard = next;
    renderStep();
    renderChrome();
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
        "one piece of your last runner's gear.";
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
    for (const background of backgrounds) {
      const button = document.createElement("button");
      button.className = "nf-bg-card";
      if (background.id === draft().backgroundId) {
        button.classList.add("nf-selected");
      }
      const title = document.createElement("div");
      title.className = "nf-bg-name";
      title.textContent = background.name;
      const bonuses = document.createElement("div");
      bonuses.className = "nf-bg-bonuses";
      bonuses.textContent = formatBonuses(background.statBonuses);
      button.append(title, bonuses);
      button.addEventListener("click", () =>
        patchDraft({ backgroundId: background.id }),
      );
      list.append(button);
    }
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
        if (id === draft().legacyItemId) button.classList.add("nf-selected");
        const nameEl = document.createElement("div");
        nameEl.className = "nf-bg-name";
        nameEl.textContent = title;
        const detailEl = document.createElement("div");
        detailEl.className = "nf-bg-bonuses";
        detailEl.textContent = detail;
        button.append(nameEl, detailEl);
        button.addEventListener("click", () =>
          patchDraft({ legacyItemId: id }),
        );
        legacyList.append(button);
      }
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
      minus.disabled = allocation[key] <= STAT_MIN;
      minus.addEventListener("click", () => setStat(allocation[key] - 1));

      const value = document.createElement("span");
      value.className = "nf-stat-value";
      value.textContent = String(allocation[key]);

      const plus = document.createElement("button");
      plus.className = "nf-button nf-button-small";
      plus.textContent = "+";
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

    const preview = document.createElement("div");
    preview.className = "nf-appearance-preview";
    const refreshPreview = (): void => {
      preview.replaceChildren(
        portraitCanvas(draft().appearance, emptyEquipment()),
        appearanceSummary(),
      );
    };
    refreshPreview();

    // Picks update the draft, picker, and preview in place instead of
    // re-rendering the step, so keyboard focus stays on the grid.
    const picker = createAppearancePicker({
      appearance: () => draft().appearance,
      initialTab: appearanceTab,
      onTabChange: (tab) => {
        appearanceTab = tab;
      },
      onPick: (category, id) => {
        submitErrors = [];
        wizard = updateDraft(wizard, {
          appearance: { ...draft().appearance, [category]: id },
        });
        picker.update();
        refreshPreview();
        renderChrome();
      },
    });

    const controls = document.createElement("div");
    controls.className = "nf-wizard-controls";
    const randomize = document.createElement("button");
    randomize.className = "nf-button";
    randomize.textContent = "Randomize Look";
    randomize.addEventListener("click", () =>
      patchDraft({ appearance: seededAppearance(Date.now()) }),
    );
    const stock = document.createElement("button");
    stock.className = "nf-button";
    stock.textContent = "Stock Look";
    stock.addEventListener("click", () =>
      patchDraft({ appearance: defaultAppearance() }),
    );
    controls.append(randomize, stock);

    left.append(picker.el);
    right.append(preview, controls);
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
    edit.addEventListener("click", () =>
      navigate(jumpTo(wizard, step, context)),
    );
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

  function renderReview(body: HTMLElement): void {
    const current = draft();
    const background = selectedBackground();
    const finalStats = background
      ? applyBonuses(current.allocation, background.statBonuses)
      : current.allocation;

    body.append(
      reviewSection("Identity", "identity", current.name.trim() || "—"),
    );

    const backgroundLines: string[] = [];
    if (background) {
      const bonuses = formatBonuses(background.statBonuses);
      backgroundLines.push(
        bonuses ? `${background.name} (${bonuses})` : background.name,
        "Starting gear: " +
          background.startingGearIds
            .map((id) => getItem(id)?.name ?? id)
            .join(", "),
      );
    }
    body.append(
      reviewSection("Background", "background", ...backgroundLines),
    );

    const statLine = STAT_KEYS.map(
      (key) => `${statLabel(key)} ${finalStats[key]}`,
    ).join(" · ");
    body.append(
      reviewSection(
        "Stats",
        "stats",
        statLine,
        derivedPreview(deriveAttributes(finalStats)),
      ),
    );

    const look = document.createElement("div");
    look.className = "nf-appearance-preview";
    look.append(
      portraitCanvas(current.appearance, emptyEquipment()),
      appearanceSummary(),
    );
    body.append(reviewSection("Appearance", "appearance", look));

    if (ngPlus) {
      const pick = current.legacyItemId
        ? (getItem(current.legacyItemId)?.name ?? current.legacyItemId)
        : "Travel light";
      body.append(
        reviewSection(
          "Legacy carry-over",
          "background",
          `${pick} · +${ngPlus.bonusPoints} bonus point-buy points`,
        ),
      );
    }

    const errors = document.createElement("div");
    for (const error of submitErrors) {
      const line = document.createElement("p");
      line.className = "nf-message nf-error";
      line.textContent = error;
      errors.append(line);
    }
    body.append(errors);
  }

  function renderStep(): void {
    if (!stepBody) return;
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
      if (step === wizard.step) chip.classList.add("nf-current");
      else if (stepValid(draft(), step, context)) chip.classList.add("nf-done");
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
    } else {
      nextButton.textContent = "Next";
      nextButton.disabled = !canAdvance(wizard, context);
    }
  }

  // --- Leaving the screen ---

  function exitToMenu(): void {
    audio.play("ui-cancel");
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
      let state = createNewGame({ character });
      if (ngPlus) state = applyNewGamePlus(state, current.legacyItemId);
      const session = createSession(state);
      audio.play("ui-confirm");
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

      progressEl = document.createElement("div");
      progressEl.className = "nf-wizard-steps";

      stepBody = document.createElement("div");
      stepBody.className = "nf-wizard-body";

      const nav = document.createElement("div");
      nav.className = "nf-wizard-nav";
      backButton = document.createElement("button");
      backButton.className = "nf-button";
      backButton.textContent = "Back";
      backButton.addEventListener("click", () => navigate(goBack(wizard)));
      navHint = document.createElement("p");
      navHint.className = "nf-message nf-error nf-wizard-hint";
      nextButton = document.createElement("button");
      nextButton.className = "nf-button nf-button-primary";
      nextButton.addEventListener("click", () => {
        if (wizard.step === "review") confirmCreate();
        else navigate(advance(wizard, context));
      });
      nav.append(backButton, navHint, nextButton);

      panel.append(header, progressEl, stepBody, nav);
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
      container?.remove();
      container = null;
      stepBody = null;
      progressEl = null;
      navHint = null;
      backButton = null;
      nextButton = null;
      exitConfirm = null;
    },
  };
}
