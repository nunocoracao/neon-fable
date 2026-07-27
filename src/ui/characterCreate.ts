import { audio } from "../audio";
import {
  CharacterCreationError,
  POINT_POOL,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  applyBonuses,
  baseStats,
  createCharacter,
  deriveAttributes,
  validateAllocation,
  type Stats,
} from "../character";
import { backgrounds, getItem, introArc } from "../data";
import { applyNewGamePlus, createNewGame } from "../state";
import {
  characterNameError,
  formatBonuses,
  pointBuyErrorMessage,
  statLabel,
} from "./format";
import { installListNav } from "./focus";
import { createGameScreen } from "./gameScreen";
import { createMainMenuScreen } from "./mainMenu";
import { showScreen, type Screen } from "./screen";
import { createSession } from "./session";

/**
 * Character creation: name, background, and point-buy stats with a live
 * derived-attribute preview. Validation and creation go through the
 * character module; this screen only renders its results. In New Game+
 * mode a modest, clearly-labeled carry-over applies: bonus point-buy
 * points and one legacy item picked from the finishing character's gear.
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

export function createCharacterCreateScreen(
  options: CharacterCreateOptions = {},
): Screen {
  let container: HTMLElement | null = null;

  const ngPlus = options.ngPlus ?? null;
  // Drop legacy ids with no content behind them (future-proofing).
  const legacyChoices = ngPlus
    ? ngPlus.legacyItemIds.filter((id) => getItem(id) !== undefined)
    : [];
  const pointPool = POINT_POOL + (ngPlus?.bonusPoints ?? 0);

  let name = "";
  let backgroundId = backgrounds[0]?.id ?? "";
  let legacyItemId: string | null = legacyChoices[0] ?? null;
  const allocation: Stats = baseStats();
  /** Errors shown after a rejected confirm; cleared on any edit. */
  let submitErrors: string[] = [];

  let backgroundList: HTMLElement | null = null;
  let backgroundDetail: HTMLElement | null = null;
  let legacyList: HTMLElement | null = null;
  let statRows: HTMLElement | null = null;
  let remainingEl: HTMLElement | null = null;
  let previewEl: HTMLElement | null = null;
  let errorsEl: HTMLElement | null = null;

  function selectedBackground() {
    return backgrounds.find((b) => b.id === backgroundId) ?? backgrounds[0];
  }

  function renderBackgrounds(): void {
    if (!backgroundList || !backgroundDetail) return;
    backgroundList.replaceChildren();
    for (const background of backgrounds) {
      const button = document.createElement("button");
      button.className = "nf-bg-card";
      if (background.id === backgroundId) button.classList.add("nf-selected");
      const title = document.createElement("div");
      title.className = "nf-bg-name";
      title.textContent = background.name;
      const bonuses = document.createElement("div");
      bonuses.className = "nf-bg-bonuses";
      bonuses.textContent = formatBonuses(background.statBonuses);
      button.append(title, bonuses);
      button.addEventListener("click", () => {
        backgroundId = background.id;
        submitErrors = [];
        renderBackgrounds();
        renderStats();
      });
      backgroundList.append(button);
    }

    const background = selectedBackground();
    backgroundDetail.replaceChildren();
    if (!background) return;
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
    backgroundDetail.append(description, gear);
  }

  /** New Game+ only: pick one legacy item (or travel light). */
  function renderLegacy(): void {
    if (!legacyList) return;
    legacyList.replaceChildren();
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
      if (id === legacyItemId) button.classList.add("nf-selected");
      const nameEl = document.createElement("div");
      nameEl.className = "nf-bg-name";
      nameEl.textContent = title;
      const detailEl = document.createElement("div");
      detailEl.className = "nf-bg-bonuses";
      detailEl.textContent = detail;
      button.append(nameEl, detailEl);
      button.addEventListener("click", () => {
        legacyItemId = id;
        submitErrors = [];
        renderLegacy();
        renderStats();
      });
      legacyList.append(button);
    }
  }

  function renderStats(): void {
    if (!statRows || !remainingEl || !previewEl || !errorsEl) return;
    const background = selectedBackground();
    const validation = validateAllocation(allocation, pointPool);
    const finalStats = background
      ? applyBonuses(allocation, background.statBonuses)
      : allocation;
    const derived = deriveAttributes(finalStats);

    remainingEl.textContent = `Points remaining: ${validation.remaining}`;

    statRows.replaceChildren();
    for (const key of STAT_KEYS) {
      const row = document.createElement("div");
      row.className = "nf-stat-row";

      const label = document.createElement("span");
      label.className = "nf-stat-label";
      label.textContent = statLabel(key);

      const minus = document.createElement("button");
      minus.className = "nf-button nf-button-small";
      minus.textContent = "−";
      minus.disabled = allocation[key] <= STAT_MIN;
      minus.addEventListener("click", () => {
        allocation[key] -= 1;
        submitErrors = [];
        renderStats();
      });

      const value = document.createElement("span");
      value.className = "nf-stat-value";
      value.textContent = String(allocation[key]);

      const plus = document.createElement("button");
      plus.className = "nf-button nf-button-small";
      plus.textContent = "+";
      plus.disabled =
        allocation[key] >= STAT_MAX || validation.remaining <= 0;
      plus.addEventListener("click", () => {
        allocation[key] += 1;
        submitErrors = [];
        renderStats();
      });

      const final = document.createElement("span");
      final.className = "nf-stat-final";
      const bonus = finalStats[key] - allocation[key];
      final.textContent =
        bonus !== 0
          ? `→ ${finalStats[key]} (${bonus > 0 ? "+" : ""}${bonus})`
          : `→ ${finalStats[key]}`;

      row.append(label, minus, value, plus, final);
      statRows.append(row);
    }

    previewEl.replaceChildren();
    const previewTitle = document.createElement("h3");
    previewTitle.textContent = "Derived";
    previewEl.append(previewTitle);
    const previewEntries: Array<[string, number]> = [
      ["Max HP", derived.maxHp],
      ["Initiative", derived.initiative],
      ["Neural capacity", derived.neuralCapacity],
      ["Melee damage bonus", derived.meleeDamageBonus],
      ["Ranged damage bonus", derived.rangedDamageBonus],
    ];
    for (const [label, amount] of previewEntries) {
      const line = document.createElement("div");
      line.className = "nf-derived-row";
      line.textContent = `${label}: ${amount}`;
      previewEl.append(line);
    }

    errorsEl.replaceChildren();
    for (const error of submitErrors) {
      const line = document.createElement("p");
      line.className = "nf-message nf-error";
      line.textContent = error;
      errorsEl.append(line);
    }
  }

  function confirm(): void {
    const background = selectedBackground();
    const errors: string[] = [];
    const nameError = characterNameError(name);
    if (nameError) errors.push(nameError);
    const validation = validateAllocation(allocation, pointPool);
    for (const error of validation.errors) {
      errors.push(pointBuyErrorMessage(error));
    }
    if (!background) errors.push("Pick a background");
    if (errors.length > 0 || !background) {
      submitErrors = errors;
      renderStats();
      return;
    }
    try {
      const character = createCharacter({
        name,
        background,
        allocation,
        pointPool,
      });
      let state = createNewGame({ character });
      if (ngPlus) state = applyNewGamePlus(state, legacyItemId);
      const session = createSession(state);
      audio.play("ui-confirm");
      showScreen(
        createGameScreen({ session, dialogueNodeId: introArc.entryNodeId }),
      );
    } catch (error) {
      if (error instanceof CharacterCreationError) {
        submitErrors = error.errors.map(pointBuyErrorMessage);
        renderStats();
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
      panel.className = "nf-panel nf-create";

      const header = document.createElement("div");
      header.className = "nf-panel-header";
      const title = document.createElement("h2");
      title.textContent = ngPlus ? "New Runner — New Game+" : "New Runner";
      const back = document.createElement("button");
      back.className = "nf-button nf-button-small";
      back.textContent = "Back";
      back.addEventListener("click", () =>
        showScreen(createMainMenuScreen()),
      );
      header.append(title, back);
      panel.append(header);

      const columns = document.createElement("div");
      columns.className = "nf-create-columns";

      // Left column: identity.
      const identity = document.createElement("div");
      identity.className = "nf-create-column";

      const nameLabel = document.createElement("label");
      nameLabel.className = "nf-field-label";
      nameLabel.textContent = "Name";
      nameLabel.htmlFor = "nf-name-input";
      const nameInput = document.createElement("input");
      nameInput.id = "nf-name-input";
      nameInput.className = "nf-input";
      nameInput.maxLength = 32;
      nameInput.placeholder = "Your street name";
      nameInput.addEventListener("input", () => {
        name = nameInput.value;
        submitErrors = [];
        renderStats();
      });

      const backgroundHeading = document.createElement("h3");
      backgroundHeading.textContent = "Background";
      backgroundList = document.createElement("div");
      backgroundList.className = "nf-bg-list";
      backgroundDetail = document.createElement("div");
      backgroundDetail.className = "nf-bg-detail";

      identity.append(
        nameLabel,
        nameInput,
        backgroundHeading,
        backgroundList,
        backgroundDetail,
      );

      // New Game+ carry-over: clearly labeled, one pick, nothing hidden.
      if (ngPlus) {
        const legacyHeading = document.createElement("h3");
        legacyHeading.textContent = "Legacy carry-over";
        const legacyNote = document.createElement("p");
        legacyNote.className = "nf-dim";
        legacyNote.textContent =
          `New Game+ bonus: +${ngPlus.bonusPoints} point-buy points and ` +
          "one piece of your last runner's gear.";
        legacyList = document.createElement("div");
        legacyList.className = "nf-bg-list";
        identity.append(legacyHeading, legacyNote, legacyList);
      }

      // Right column: point-buy stats and derived preview.
      const statsColumn = document.createElement("div");
      statsColumn.className = "nf-create-column";

      const statsHeading = document.createElement("h3");
      statsHeading.textContent = ngPlus
        ? `Stats (${POINT_POOL} + ${ngPlus.bonusPoints} legacy points)`
        : `Stats (${POINT_POOL} points)`;
      remainingEl = document.createElement("div");
      remainingEl.className = "nf-remaining";
      statRows = document.createElement("div");
      statRows.className = "nf-stat-rows";
      previewEl = document.createElement("div");
      previewEl.className = "nf-derived";
      errorsEl = document.createElement("div");

      const confirmButton = document.createElement("button");
      confirmButton.className = "nf-button nf-button-primary";
      confirmButton.textContent = "Jack In";
      confirmButton.addEventListener("click", confirm);

      statsColumn.append(
        statsHeading,
        remainingEl,
        statRows,
        previewEl,
        errorsEl,
        confirmButton,
      );

      columns.append(identity, statsColumn);
      panel.append(columns);
      container.append(panel);
      root.append(container);

      installListNav(panel);
      renderBackgrounds();
      renderLegacy();
      renderStats();
      nameInput.focus();
    },

    unmount(): void {
      container?.remove();
      container = null;
      backgroundList = null;
      backgroundDetail = null;
      legacyList = null;
      statRows = null;
      remainingEl = null;
      previewEl = null;
      errorsEl = null;
    },
  };
}
